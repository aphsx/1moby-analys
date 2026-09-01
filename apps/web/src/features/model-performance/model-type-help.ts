/** Plain-Thai blurb per model card — what the model predicts (not how it is trained). */

export interface ModelTypeHelp {
  label: string;
  help: string;
}

export const MODEL_TYPE_HELP: Record<string, ModelTypeHelp> = {
  lifecycle: {
    label: "Lifecycle (กติกา)",
    help: "ไม่ใช่โมเดล ML — แบ่งลูกค้าเป็น Ghost / Churned / Active จากพฤติกรรมจริง ใช้กรองว่าใครควรได้คะแนน churn/CLV/credit",
  },
  churn: {
    label: "Churn",
    help: "ทำนายว่าลูกค้าที่ยัง active จะหยุดใช้งาน (churn) ภายใน 180 วันข้างหน้าหรือไม่ — ได้เป็น % ความเสี่ยงต่อคน ไม่ใช่การันตีว่าจะเลิกแน่",
  },
  clv: {
    label: "CLV",
    help: "ทำนายมูลค่ารายได้ 6 เดือนข้างหน้า (CLV) + โอกาสที่ลูกค้าจะมีรายได้ (P จ่าย) + ช่วงมูลค่า — ใช้จัดลำดับ/ tier มากกว่าทายยอดเป๊ะรายคน",
  },
  credit: {
    label: "Credit",
    help: "ทำนายการใช้เครดิต 30/90 วันข้างหน้าเป็นช่วง (ต่ำ–กลาง–สูง) และเตือนกรณีใกล้หมดเครดิต — ไม่ใช่ % ความแม่นยำแบบ yes/no",
  },
};

export const BASELINE_HELP =
  "ค่า baseline = วิธีง่าย ๆ (rule หรือเป้าขั้นต่ำ) ที่โมเดลต้องชนะ — ไม่ใช่ % ลูกค้าที่จะ churn หรือ accuracy โดยตรง";
