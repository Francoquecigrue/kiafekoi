// Données du jeu. Candidats : présidentielle 2022 (1er tour).
// Pour ajouter une vraie photo : déposer photos/<id>.jpg (sinon initiales affichées).
// Faits vérifiés le 13/11/2026. Les questions de mandat sont bornées à « avant 2022 »
// (ex. Roussel maire depuis 2025, Jadot sénateur depuis 2023).
const CANDIDATES = [
  { id: "arthaud",   name: "Nathalie Arthaud",      color: "#b71c1c" },
  { id: "roussel",   name: "Fabien Roussel",        color: "#d32f2f" },
  { id: "macron",    name: "Emmanuel Macron",       color: "#f9a825" },
  { id: "lassalle",  name: "Jean Lassalle",         color: "#6d4c41" },
  { id: "lepen",     name: "Marine Le Pen",         color: "#1a237e" },
  { id: "zemmour",   name: "Éric Zemmour",          color: "#37474f" },
  { id: "melenchon", name: "Jean-Luc Mélenchon",    color: "#c62828" },
  { id: "hidalgo",   name: "Anne Hidalgo",          color: "#e91e63" },
  { id: "jadot",     name: "Yannick Jadot",         color: "#2e7d32" },
  { id: "pecresse",  name: "Valérie Pécresse",      color: "#1565c0" },
  { id: "poutou",    name: "Philippe Poutou",       color: "#880e4f" },
  { id: "nda",       name: "Nicolas Dupont-Aignan", color: "#283593" },
];

const QUESTIONS = [
  { q: "A fait l'ENA", a: ["macron", "pecresse", "nda"] },
  { q: "Est une femme", a: ["arthaud", "lepen", "hidalgo", "pecresse"] },
  { q: "Était déjà candidat(e) à la présidentielle 2017", a: ["arthaud", "macron", "lassalle", "lepen", "melenchon", "poutou", "nda"] },
  { q: "A été ministre avant 2022", a: ["macron", "melenchon", "pecresse"] },
  { q: "A été député(e) à l'Assemblée nationale avant 2022", a: ["lepen", "melenchon", "lassalle", "nda", "roussel", "pecresse"] },
  { q: "A été député(e) européen(ne) avant 2022", a: ["lepen", "melenchon", "jadot"] },
  { q: "A été maire avant 2022", a: ["hidalgo", "nda", "lassalle"] },
  { q: "Est né(e) hors de France", a: ["melenchon", "hidalgo"] },
  { q: "A été sénateur / sénatrice avant 2022", a: ["melenchon"] },
  { q: "S'était déjà qualifié(e) pour un second tour avant 2022", a: ["macron", "lepen"] },
  { q: "A exercé le métier de journaliste", a: ["zemmour", "roussel", "melenchon"] },
  { q: "Représentait un parti trotskiste en 2022", a: ["arthaud", "poutou"] },
  { q: "A présidé un conseil régional avant 2022", a: ["pecresse"] },
  { q: "Est diplômé(e) de Sciences Po Paris", a: ["macron", "zemmour", "nda"] },
  { q: "Est né(e) dans les années 1970", a: ["macron", "arthaud"] },
  { q: "A exercé la profession d'avocat(e)", a: ["lepen"] },
  { q: "A fait plus de 20 % au 1er tour 2022", a: ["macron", "lepen", "melenchon"] },
  { q: "A fait plus de 5 % au 1er tour 2022", a: ["macron", "lepen", "melenchon", "zemmour"] },
  { q: "A fait moins de 2 % au 1er tour 2022", a: ["hidalgo", "arthaud", "poutou"] },
  { q: "A été professeur(e) en lycée", a: ["arthaud", "melenchon"] },
  { q: "A été membre du Parti socialiste", a: ["macron", "melenchon", "hidalgo"] },
  { q: "A été membre de l'UMP", a: ["nda", "pecresse"] },
];
