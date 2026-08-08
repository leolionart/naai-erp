type LegacyLine = Readonly<{ description?: unknown; dimensions?: unknown }>;
type LegacyDocument = Readonly<{ type?: unknown; lines?: unknown }>;

const hasAny = (value: string, terms: readonly string[]) =>
  terms.some((term) => value.includes(term));

export function inferLegacyDocumentCategory(document: LegacyDocument): string {
  const lines = Array.isArray(document.lines) ? (document.lines as LegacyLine[]) : [];
  for (const line of lines) {
    const dimensions =
      line.dimensions && typeof line.dimensions === "object"
        ? (line.dimensions as Record<string, unknown>)
        : undefined;
    const explicit = String(dimensions?.category ?? "").trim();
    if (explicit) return explicit;
  }

  const type = String(document.type ?? "");
  if (type === "sales_invoice") return "SOFTWARE_DEV";
  if (type !== "purchase_invoice") return "";
  const description = lines
    .map((line) => String(line.description ?? "").toLocaleLowerCase("vi"))
    .join(" ");

  if (hasAny(description, ["tên miền", "domain", "hosting"])) return "DOMAIN_HOSTING";
  if (hasAny(description, ["internet", "fpt play", "thiết bị đầu cuối"])) return "INTERNET_TELECOM";
  if (hasAny(description, ["điện tiêu thụ", "tiền điện", "khung giờ"])) return "ELECTRICITY_WATER";
  if (hasAny(description, ["thuê pin", "trạm sạc"])) return "VEHICLE_RENTAL";
  if (hasAny(description, ["freepik", "images and templates", "api pay as you go"]))
    return "SERVER_CLOUD";
  if (
    hasAny(description, [
      "iphone",
      "macbook",
      "mbp ",
      "ssd",
      "máy in",
      "chuột bluetooth",
      "micro ",
      "speaker",
      "máy quay",
      "máy lọc nước",
    ])
  )
    return "ELECTRONIC_EQUIP";
  if (description.includes("màn sáo")) return "DECORATION";
  if (
    hasAny(description, [
      "buffet",
      "ăn uống",
      "suất ăn",
      "cà phê",
      "cafe",
      "trà ",
      "trà sữa",
      "nước ",
      "soda",
      "pepsi",
      "coke",
      "bò ",
      "gà ",
      "cơm ",
      "mì ",
      "mỳ ",
      "chè ",
      "bánh ",
      "thịt ",
      "súp ",
      "gỏi ",
      "xiên nướng",
      "khăn lạnh",
      "khăn giấy",
      "kichi",
    ])
  )
    return "MEAL";
  return "OTHER_EXPENSE";
}
