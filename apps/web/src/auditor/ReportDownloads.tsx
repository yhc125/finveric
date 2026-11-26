import { Download } from "lucide-react";
import { saveFile } from "../shared/api.ts";
import { Button } from "../shared/button.tsx";
import {
  reportCsv,
  reportFileName,
  saveText,
  type AuditReport,
} from "./report.ts";
import ui from "../shared/ui.module.css";

export function ReportDownloads({
  getReport,
}: {
  getReport: () => AuditReport;
}) {
  return (
    <div className={ui.actions} role="group" aria-label="대조 결과 내려받기">
      <Button
        variant="outline"
        type="button"
        onClick={() => {
          const report = getReport();
          saveFile(report, reportFileName(report, "json"));
        }}
      >
        <Download size={16} aria-hidden="true" />
        JSON 내려받기
      </Button>
      <Button
        variant="outline"
        type="button"
        onClick={() => {
          const report = getReport();
          saveText(
            reportCsv(report),
            reportFileName(report, "csv"),
            "text/csv;charset=utf-8",
          );
        }}
      >
        <Download size={16} aria-hidden="true" />
        CSV 내려받기
      </Button>
    </div>
  );
}
