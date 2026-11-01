import { expect, test } from "bun:test";
import { pageItems } from "./page-items";

test("pageItems keeps first, last and neighbours", () => {
  expect(pageItems(1, 1)).toEqual([1]);
  expect(pageItems(1, 258)).toEqual([1, 2, "…", 258]);
  expect(pageItems(5, 258)).toEqual([1, "…", 4, 5, 6, "…", 258]);
  expect(pageItems(3, 258)).toEqual([1, 2, 3, 4, "…", 258]);
  expect(pageItems(258, 258)).toEqual([1, "…", 257, 258]);
  expect(pageItems(2, 4)).toEqual([1, 2, 3, 4]);
});
