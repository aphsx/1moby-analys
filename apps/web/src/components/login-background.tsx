import styles from "./intro.module.css";

export function LoginBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className={`${styles.bgCover} ${styles.bgCoverStatic}`} />
    </div>
  );
}
