export const PROJECTS = [
  {
    id: "hshk",
    label: "HSHK",
    file: "hshk_08.csv",
    site: "sc-domain:holidaysmart.io",
    keywordsCol: 14,
    pageUrlCol: 13,
  },
  {
    id: "top",
    label: "TopPage",
    file: "topPage_08.csv",
    site: "sc-domain:pretty.presslogic.com",
    keywordsCol: 2,
    pageUrlCol: 1,
  },
];

export function getProjectConfig(id) {
  if (!id) return null;
  return PROJECTS.find((project) => project.id === id) || null;
}
