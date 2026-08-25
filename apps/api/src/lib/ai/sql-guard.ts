import {
  AI_SQL_DEFAULT_LIMIT,
  AI_SQL_MAX_LIMIT,
  type AiUserRole,
  getAllowedTables,
} from "./semantic-layer";

export type SqlValidationResult =
  | { ok: true; sql: string; warnings: string[] }
  | { ok: false; reason: string };

const BLOCKED_TOKENS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "truncate",
  "create",
  "grant",
  "revoke",
  "copy",
  "execute",
  "call",
  "do",
  "vacuum",
  "analyze",
  "set",
  "reset",
  "listen",
  "notify",
];

const BLOCKED_TOKEN_RES = BLOCKED_TOKENS.map(
  (token) => [token, new RegExp(`\\b${token}\\b`, "i")] as const
);

const SQL_KEYWORDS = new Set([
  "select",
  "from",
  "where",
  "join",
  "left",
  "right",
  "full",
  "inner",
  "outer",
  "on",
  "and",
  "or",
  "not",
  "is",
  "null",
  "as",
  "group",
  "by",
  "order",
  "having",
  "limit",
  "offset",
  "desc",
  "asc",
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "case",
  "when",
  "then",
  "else",
  "end",
  "distinct",
  "true",
  "false",
  "between",
  "in",
  "like",
  "ilike",
  "coalesce",
  "round",
  "date_trunc",
  "extract",
  "now",
  "current_date",
  "interval",
]);

const ALLOWED_FUNCTIONS = new Set([
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "coalesce",
  "round",
  "date_trunc",
  "extract",
  "now",
]);

const SQL_LINE_COMMENT_RE = /--.*$/gm;
const SQL_BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const TRAILING_SEMICOLONS_RE = /;+\s*$/g;
const SINGLE_QUOTED_LITERAL_RE = /'([^']|'')*'/g;
const DOUBLE_QUOTED_LITERAL_RE = /"([^"]|"")*"/g;
const TABLE_REFERENCE_RE =
  /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+(?:as\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/gi;
const LIMIT_CLAUSE_RE = /\blimit\s+(\d+)\b/i;
const LIMIT_CLAUSE_REPLACE_RE = /\blimit\s+\d+\b/i;
const SELECT_LIST_RE = /\bselect\s+([\s\S]+?)\s+\bfrom\b/i;
const STAR_SELECT_RE = /(^|,)\s*(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?\*\s*(?:,|$)/;
const TRAILING_ALIAS_RE = /\s+as\s+[a-zA-Z_][a-zA-Z0-9_]*$/i;
const TRAILING_IDENTIFIER_RE = /(?:^|\.)([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;
const NAMED_ALIAS_RE = /\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i;
const DOLLAR_QUOTE_RE = /\$\$/;
const SELECT_ONLY_RE = /^select\b/i;
const QUALIFIED_COLUMN_RE = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
const IDENTIFIER_RE = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;

function stripSqlComments(sql: string): string {
  return sql.replace(SQL_LINE_COMMENT_RE, "").replace(SQL_BLOCK_COMMENT_RE, "");
}

function normalizeSql(sql: string): string {
  return stripSqlComments(sql).trim().replace(TRAILING_SEMICOLONS_RE, "");
}

function stripStringLiterals(sql: string): string {
  return sql
    .replace(SINGLE_QUOTED_LITERAL_RE, "''")
    .replace(DOUBLE_QUOTED_LITERAL_RE, '""');
}

function referencedTables(sql: string): string[] {
  const matches = sql.matchAll(TABLE_REFERENCE_RE);
  return [...matches].map((match) => match[1].toLowerCase());
}

function tableAliases(sql: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const matches = sql.matchAll(TABLE_REFERENCE_RE);
  for (const match of matches) {
    const table = match[1].toLowerCase();
    const alias = match[2]?.toLowerCase();
    aliases.set(table, table);
    if (alias && !SQL_KEYWORDS.has(alias)) {
      aliases.set(alias, table);
    }
  }
  return aliases;
}

function extractLimit(sql: string): number | null {
  const match = sql.match(LIMIT_CLAUSE_RE);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function ensureLimit(sql: string, warnings: string[]): string {
  const limit = extractLimit(sql);
  if (limit === null) {
    warnings.push(`No LIMIT found; applied LIMIT ${AI_SQL_DEFAULT_LIMIT}.`);
    return `${sql} LIMIT ${AI_SQL_DEFAULT_LIMIT}`;
  }
  if (limit > AI_SQL_MAX_LIMIT) {
    warnings.push(`LIMIT ${limit} reduced to ${AI_SQL_MAX_LIMIT}.`);
    return sql.replace(LIMIT_CLAUSE_REPLACE_RE, `LIMIT ${AI_SQL_MAX_LIMIT}`);
  }
  return sql;
}

function selectedColumns(sql: string): string[] {
  const match = sql.match(SELECT_LIST_RE);
  if (!match) {
    return [];
  }
  const selectList = match[1];
  if (STAR_SELECT_RE.test(selectList)) {
    return ["*"];
  }
  return selectList
    .split(",")
    .map((part) => {
      const withoutAlias = part.replace(TRAILING_ALIAS_RE, "").trim();
      const token = withoutAlias.match(TRAILING_IDENTIFIER_RE)?.[1];
      return token?.toLowerCase() ?? "";
    })
    .filter(Boolean);
}

function outputAliases(sql: string): Set<string> {
  const aliases = new Set<string>();
  const match = sql.match(SELECT_LIST_RE);
  if (!match) {
    return aliases;
  }
  for (const part of match[1].split(",")) {
    const alias = part.match(NAMED_ALIAS_RE)?.[1];
    if (alias) {
      aliases.add(alias.toLowerCase());
    }
  }
  return aliases;
}

export function validateTextToSql(
  sql: string,
  role: AiUserRole
): SqlValidationResult {
  const normalized = normalizeSql(sql);
  const warnings: string[] = [];

  if (!normalized) {
    return { ok: false, reason: "SQL is empty." };
  }
  if (!SELECT_ONLY_RE.test(normalized)) {
    return { ok: false, reason: "Only SELECT statements are allowed." };
  }
  if (normalized.includes(";")) {
    return { ok: false, reason: "Multiple SQL statements are not allowed." };
  }

  const lowered = normalized.toLowerCase();
  if (DOLLAR_QUOTE_RE.test(lowered)) {
    return { ok: false, reason: "Dollar-quoted SQL blocks are not allowed." };
  }
  for (const [token, tokenRe] of BLOCKED_TOKEN_RES) {
    if (tokenRe.test(lowered)) {
      return { ok: false, reason: `Blocked SQL token: ${token}.` };
    }
  }

  const allowedTables = getAllowedTables(role);
  const allowedTableNames = new Set(allowedTables.map((table) => table.name));
  const usedTables = referencedTables(normalized);
  if (usedTables.length === 0) {
    return {
      ok: false,
      reason: "SQL must reference at least one allowed table.",
    };
  }
  for (const tableName of usedTables) {
    if (!allowedTableNames.has(tableName)) {
      return {
        ok: false,
        reason: `Table is not allowed for this role: ${tableName}.`,
      };
    }
  }

  const aliases = tableAliases(normalized);
  const tableAliasNames = new Set(aliases.keys());
  const allowedColumnsByTable = new Map(
    allowedTables.map((table) => [
      table.name,
      new Set(table.columns.map((column) => column.name)),
    ])
  );
  const allowedColumnsForUsedTables = new Set<string>();
  for (const tableName of usedTables) {
    for (const column of allowedColumnsByTable.get(tableName) ?? []) {
      allowedColumnsForUsedTables.add(column);
    }
  }

  const qualifiedColumns = normalized.matchAll(QUALIFIED_COLUMN_RE);
  for (const match of qualifiedColumns) {
    const tableOrAlias = match[1].toLowerCase();
    const column = match[2].toLowerCase();
    const table = aliases.get(tableOrAlias);
    if (!table) {
      return { ok: false, reason: `Unknown table alias: ${tableOrAlias}.` };
    }
    if (!allowedColumnsByTable.get(table)?.has(column)) {
      return {
        ok: false,
        reason: `Column is not allowed: ${tableOrAlias}.${column}.`,
      };
    }
  }

  const selected = selectedColumns(normalized);
  if (selected.includes("*")) {
    return {
      ok: false,
      reason: "SELECT * is not allowed. Select explicit columns.",
    };
  }

  const allowedIdentifiers = new Set<string>([
    ...SQL_KEYWORDS,
    ...ALLOWED_FUNCTIONS,
    ...allowedTableNames,
    ...tableAliasNames,
    ...allowedColumnsForUsedTables,
    ...outputAliases(normalized),
  ]);
  const identifierSql = stripStringLiterals(normalized);
  const identifiers = identifierSql.match(IDENTIFIER_RE) ?? [];
  for (const identifier of identifiers) {
    const normalizedIdentifier = identifier.toLowerCase();
    if (!allowedIdentifiers.has(normalizedIdentifier)) {
      return {
        ok: false,
        reason: `Identifier is not allowed or not modeled: ${identifier}.`,
      };
    }
  }

  return { ok: true, sql: ensureLimit(normalized, warnings), warnings };
}
