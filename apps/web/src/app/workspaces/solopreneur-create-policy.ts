export type WorkflowCreateCapabilities = Readonly<{
  operatingMode?: string;
  callerIsOwner?: boolean;
  callerCanSaveAndRecord?: boolean;
}>;

export function canSaveAndRecord(capabilities?: WorkflowCreateCapabilities): boolean {
  return (
    capabilities?.callerCanSaveAndRecord === true ||
    (capabilities?.operatingMode === "solopreneur" && capabilities.callerIsOwner === true)
  );
}

export function createSubmitLabel(capabilities?: WorkflowCreateCapabilities): string {
  return canSaveAndRecord(capabilities) ? "Lưu và ghi nhận" : "Lưu bản nháp";
}
