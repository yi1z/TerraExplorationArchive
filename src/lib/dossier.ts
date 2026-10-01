export const dossierSections = [
  "overview",
  "details",
  "complete",
  "data",
  "gallery",
  "relations",
  "sources",
] as const;
export type DossierSection = (typeof dossierSections)[number];
export function readDossierSection(value: string | null): DossierSection {
  return dossierSections.includes(value as DossierSection)
    ? (value as DossierSection)
    : "overview";
}
export function sectionForRecord(section: DossierSection, curated: boolean) {
  if (curated && section === "data") return "complete";
  if (!curated && (section === "details" || section === "complete"))
    return "data";
  return section;
}
export type DossierPhase = "stage" | "departing" | "reading" | "returning";
export const DOSSIER_MOTION = { depart: 180, expand: 320 } as const;
