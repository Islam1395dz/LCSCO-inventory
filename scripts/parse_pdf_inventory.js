// scripts/parse_pdf_inventory.js
import fs from 'fs';
import path from 'path';

// Complete raw data rows from the 21-page PDF
const RAW_ROWS = [
  // Page 1 (1-24)
  [1, "1-Propanol", "71-23-8", "500 mL", "R 3 0 2", "Armoire C - Étage C1.5"],
  [2, "Acétone / H2SO4", "67-64-1", "1 L", "", "Armoire C - Étage C1.5"],
  [3, "Ethyl acetate / Na2S2O3", "141-78-6", "300 mL", "", "Armoire C - Étage C1.5"],
  [4, "Ethyl acetate", "141-78-6", "400 mL", "", "Armoire C - Étage C1.5"],
  [5, "Acetonitrile", "75-05-8", "250 mL", "", "Armoire C - Étage C1.5"],
  [6, "Cyclohexane", "101-83-8", "1 L + 500 mL", "", "Armoire C - Étage C1.5"],
  [7, "Acetophenone", "98-86-2", "10 mL", "", "Armoire C - Étage C1.5"],
  [8, "Cyclohexanol", "108-93-0", "600 mL", "", "Armoire C - Étage C1.5"],
  [9, "Ethyl acetate", "141-78-6", "400 mL", "", "Armoire C - Étage C1.5"],
  [10, "Cyclohexene", "101-83-8", "10 mL", "", "Armoire C - Étage C1.5"],
  [11, "HCl (0,15M)", "141-78-6", "500 mL", "", "Armoire C - Étage C1.5"],
  [12, "1-Octen 98%", "111-66-0", "800 mL", "", "Armoire C - Étage C1.5"],
  [13, "NaOH 0,1 N BERRAHOU", "/", "500 mL", "", "Armoire C - Étage C1.5"],
  [14, "Tetrahydrofuran (THF)", "109-99-9", "2 L", "", "Armoire C - Étage C1.5"],
  [15, "Hexane", "110-54-3", "1 L + 800 mL", "", "Armoire C - Étage C1.5"],
  [16, "Ethyl acetate", "141-78-6", "400 mL", "", "Armoire C - Étage C1.5"],
  [17, "Chloroforme", "67-66-3", "10 mL", "", "Armoire C - Étage C1.5"],
  [18, "Polyoxyméthylène / Paraformaldéhyde", "/", "500 g", "", "Armoire C - Étage C1.4"],
  [19, "Furfural", "98-01-1", "300 mL", "", "Armoire C - Étage C1.4"],
  [20, "Sodium sulfate (Sulfate de sodium)", "7757-82-6", "0", "", "/"],
  [21, "Acétone", "67-64-1", "0", "", "/"],
  [22, "Tetra butyl ammonium Fluoride solution", "429-41-4", "90 mL", "R 3 0 3", "Frigo A1, D1"],
  [23, "O-(Benzotriazol-1-yl)-N,N,N',N'-tetramethyluronium tetrafluoroborate (HBTU)", "125700-67-6", "60 g", "", "Frigo A1, D1"],
  [24, "propiolic acid (2flacon)", "471-25-0", "13 g - 5g", "", "Frigo A1, D1"],

  // Page 2 (25-51)
  [25, "Diethyl ether", "60-29-7", "250 mL", "", "Frigo A1, D1"],
  [26, "N-Butylamine", "109-73-9", "500 mL", "", "Frigo A1, D1"],
  [27, "Acetic anhydride", "/", "/", "", "Frigo A1, D1"],
  [28, "Acetaldehyde", "80-280", "375 mL", "", "Frigo A1, D1"],
  [29, "Ibuprofen 12 ppm", "145-78-6", "625 mL", "", "Frigo A1, D1"],
  [30, "Malononitrile", "109-77-3", "675 g", "", "Frigo A1, D1"],
  [31, "Tributyltin hydride", "688-73-3", "50 g", "", "Frigo A1, D1"],
  [32, "Bromoethane", "/", "125 g", "", "Frigo A1, D1"],
  [33, "Di-tert-butyl-dicarbonate", "24424-99-5", "20 g", "", "Frigo A1, D1"],
  [34, "propargylamine hydrochloride", "1543-52-1", "5 g", "", "Frigo A1, D1"],
  [35, "Acide trifluoroacétique", "76-05-1", "80 mL", "", "Frigo A1, D2"],
  [36, "(±)-Epichlorohydrin", "/", "800 mL", "", "Frigo A1, D2"],
  [37, "Paracetamol", "141-786", "200 ml", "", "Frigo A1, D2"],
  [38, "Luperox TBH70X (tert-Butyl hydroperoxide Solution)", "75-91-2", "700 mL", "", "Frigo A1, D2"],
  [39, "tert-Butyl hydroperoxide", "/", "600 mL", "", "Frigo A1, D2"],
  [40, "Acide trifluorométhanesulfonique", "/", "/", "", "Frigo A1, D2"],
  [41, "Luperox TBH70X (tert-Butyl hydroperoxide solution)", "75-91-2", "500 mL", "", "Frigo A1, D2"],
  [42, "chloroacetone", "78-95-5", "300 mL", "", "Frigo A1, D2"],
  [43, "Schwefelkohlenstoff (2 flacon)", "359414", "300ml-100 mL", "", "Frigo A1, D3"],
  [44, "Acetaldehyde", "75-07-0", "900 mL", "", "Frigo A1, D3"],
  [45, "oxalyl chloride solution", "79-37-8", "300 mL", "", "Frigo A1, D3"],
  [46, "crotonaldehyde", "4170-30-3", "50 mL", "", "Frigo A1, D3"],
  [47, "Vinyl acetate", "/", "/", "", "Frigo A1, D3"],
  [48, "Isobutyraldehyde", "78-84-2", "700 mL", "", "Frigo A1, D3"],
  [49, "Butyl chloroformate 98%", "592-34-7", "30 g", "", "Frigo A1, D3"],
  [50, "1,3-Butadiene 2-wt solution in toluene", "/", "140 g", "", "Frigo A1, D3"],
  [51, "Diisobutylaluminum hydride losung", "/", "100ml", "", "Frigo A1, E1"],

  // Page 3 (52-79)
  [52, "Butyraldehyde", "123-72-8", "50 mL", "", "Frigo A1, E1"],
  [53, "diethyl pyrocarbonate", "1609-47-8", "25g", "", "Frigo A1, E1"],
  [54, "3-chloroperbenzoic acid (mCPBA)", "937-14-4", "250 g", "", "Frigo A1, E1"],
  [55, "Curcumin", "458-37-7", "25 g", "", "Frigo A1, E1"],
  [56, "Luperox A70S Benzoyl", "/", "/", "", "Frigo A1, E1"],
  [57, "Benzoyl peroxide", "94-36-0", "50 g", "", "Frigo A1, E1"],
  [58, "2-Mercaptoethanol", "60-24-2", "200 mL", "", "Frigo A1, E1"],
  [59, "peroxyde d'hydrogène 50%", "/", "300 mL", "", "Frigo A1, P4"],
  [60, "tert-butanol", "75-65-0", "300 mL", "", "Frigo A1, P4"],
  [61, "chlorotriisopropoxytitanium", "20717-86-6", "100g", "", "Frigo A1, P4"],
  [62, "Acetaldehyde, Kosher", "75-07-0", "2 kg", "", "Frigo A2 E3"],
  [63, "Acetonitrile", "/", "1.25 L", "", "Paillasse labo R303"],
  [64, "Diethyl ether", "/", "0.5 L", "", "Paillasse labo R303"],
  [65, "Benzol", "81670", "600 mL", "", "Paillasse labo R303"],
  [66, "Anilin", "6335", "400 mL", "", "Paillasse labo R303"],
  [67, "phenol", "81450", "600 g", "", "Paillasse labo R303"],
  [68, "Silica Gel 63-200", "/", "700 g", "", "Paillasse labo R303"],
  [69, "Silica Gel", "112926-00-8", "20 g", "", "Paillasse labo R303"],
  [70, "acetic acid", "64-19-7", "2 L", "", "Paillasse labo R303"],
  [71, "2-Fuxoic acid", "88-14-2", "60 g", "", "Armoire HPLC"],
  [72, "Sussinic acid", "110-15-6", "50 g", "", "Armoire HPLC"],
  [73, "Fumaric acid", "110-17-8", "30 g", "", "Armoire HPLC"],
  [74, "trans-1,2-Cyclohexanediol", "1460-57-7", "3 g", "R 3 0 5", "Armoire E; Etage E1"],
  [75, "Bleu de Méthylène", "—", "400 g", "", "Armoire E; Etage E1"],
  [76, "Gel de silice SiO2 x H2O", "97210", "600 g", "", "Armoire E; Etage E1"],
  [77, "Aluminum oxide for drying", "6400", "100 g", "", "Armoire E; Etage E1"],
  [78, "Aluminum oxide, pellets, 3mm", "1344-28-1", "500 g", "", "Armoire E; Etage E1"],
  [79, "Aluminum oxide", "80600", "100 g", "", "Armoire E; Etage E1"],

  // Page 4 (80-107)
  [80, "Barium oxide", "—", "500 g", "", "Armoire E; Etage E1"],
  [81, "Aluminium tributoxide", "3085-30-1", "—", "", "Armoire E; Etage E1"],
  [82, "Cupric oxide", "61202", "500 g", "", "Armoire E; Etage E1"],
  [83, "Zirconium(IV) oxide", "1314-23-4", "10 g", "", "Armoire E; Etage E1"],
  [84, "Sodium molybdate dihydrate", "71756", "800 g", "", "Armoire E; Etage E1"],
  [85, "oxide de chroma III", "—", "200 g", "", "Armoire E; Etage E1"],
  [86, "Zirconium(IV) oxide", "29-289-236", "200 g", "", "Armoire E; Etage E1"],
  [87, "Sodium molybdate dihydrate", "10102-40-6", "300 g", "", "Armoire E; Etage E1"],
  [88, "ferric sulfate", "—", "500 g", "", "Armoire E; Etage E1"],
  [90, "dioxide de titane", "1317-70-0", "900 g", "", "Armoire E; Etage E2"],
  [91, "Sulfate de cuivre", "4091-8432", "500 g", "", "Armoire E; Etage E2"],
  [92, "Thiocyanate de potassium", "3299", "300 g", "", "Armoire E; Etage E2"],
  [93, "Adipic acid", "124-04-9", "10 g", "", "Armoire E; Etage E2"],
  [94, "Aluminum oxide", "292462-889", "100 g", "", "Armoire E; Etage E2"],
  [95, "Ferric oxide", "44955", "700 g", "", "Armoire E; Etage E2"],
  [96, "Soufre", "—", "20 g", "", "Armoire E; Etage E2"],
  [97, "Triphenylphosphine", "603-35-0", "20 g", "", "Armoire E; Etage E2"],
  [98, "carbonate de sodium", "—", "5 g", "", "Armoire E; Etage E2"],
  [99, "chlorure de barium", "—", "10 g", "", "Armoire E; Etage E2"],
  [100, "Triphenylphosphine", "210-036-0", "600 g", "", "Armoire E; Etage E2"],
  [101, "Natrium arsenicum", "9693530", "200 g", "", "Armoire E; Etage E2"],
  [102, "Diphenyl carbazide", "—", "10 g", "", "Armoire E; Etage E2"],
  [103, "Cuivre(II) oxide", "23-144-263", "100 g", "", "Armoire E; Etage E2"],
  [104, "Ammonium heptamolybdate", "3666", "200 g", "", "Armoire E; Etage E2"],
  [105, "Acide borique", "—", "1 kg", "", "Armoire E; Etage E2"],
  [106, "biochromate de potassium", "—", "10 g", "", "Armoire E; Etage E2"],
  [107, "soufre", "—", "—", "", "Armoire E; Etage E2"],

  // Page 5 (108-135)
  [108, "lead dioxide", "—", "—", "", "Armoire E; Etage E2"],
  [110, "Sodium metavanadate", "13718-26-8", "300 g", "", "Armoire E; Etage E3"],
  [111, "Acide fuchsin for microscopy", "84600", "100 g", "", "Armoire E; Etage E3"],
  [112, "Vanadium V oxide", "1314-62-1", "100 g", "", "Armoire E; Etage E3"],
  [113, "Nitrate de magnesium", "—", "2 g", "", "Armoire E; Etage E3"],
  [114, "dioxide de titane calciné", "—", "5 g", "", "Armoire E; Etage E3"],
  [115, "Bioxide de Mercure", "—", "2 g", "", "Armoire E; Etage E3"],
  [116, "alumine", "—", "—", "", "Armoire E; Etage E3"],
  [117, "Copper", "273308-689", "500 g", "", "Armoire E; Etage E3"],
  [118, "iodine", "57650", "500 g", "", "Armoire E; Etage E3"],
  [119, "Butanol", "75-65-0", "1 kg", "", "Armoire E; Etage E3"],
  [120, "Gel de silice", "—", "300 g", "", "Armoire E; Etage E3"],
  [121, "Kalium chlorid", "8604881", "100 g", "", "Armoire E; Etage E3"],
  [122, "sulfate de sodium decahydrate", "8555101", "100 g", "", "Armoire E; Etage E3"],
  [123, "Nickel III oxide", "275404-788", "600 g", "", "Armoire E; Etage E3"],
  [124, "Iron III chloride 6-hydrate", "141358", "—", "", "Armoire E; Etage E3"],
  [125, "Lithium hydroxide monohydrate", "1310-65-2", "800 g", "", "Armoire E; Etage E3"],
  [126, "nittrate de calcium tetrahydrate ( 2 flacons)", "—", "100 g", "", "Armoire E; Etage E4"],
  [127, "Ethylene glycol", "—", "20 mL", "", "Armoire E; Etage E4"],
  [128, "Charbon actif", "—", "—", "", "Armoire E; Etage E4"],
  [129, "Bentonite brut", "—", "—", "", "Armoire E; Etage E4"],
  [130, "Iodate de potassium", "—", "—", "", "Armoire E; Etage E4"],
  [131, "Citrate de sodium", "—", "150 g", "", "Armoire E; Etage E4"],
  [132, "thiosulfate de sodium", "—", "2 g", "", "Armoire E; Etage E4"],
  [133, "KaRu2OCl2", "—", "—", "", "Armoire E; Etage E4"],
  [134, "Acide oxalique", "1882", "100 g", "", "Armoire E; Etage E4"],
  [135, "dioxide de manganese", "—", "30 g", "", "Armoire E; Etage E4"],

  // Page 6 (136-163)
  [136, "Cérium calciné", "—", "1 g", "", "Armoire E; Etage E4"],
  [137, "Amidon soluble", "—", "10 g", "", "Armoire E; Etage E4"],
  [138, "sulfate de manganese II monohydrate", "—", "200 g", "", "Armoire E; Etage E4"],
  [139, "Oxalate de calcium", "—", "200 g", "", "Armoire E; Etage E4"],
  [140, "Cyclopentadiène", "—", "—", "", "Armoire E; Etage E4"],
  [141, "Bentonite broyé", "—", "—", "", "Armoire E; Etage E4"],
  [142, "acide formique", "—", "300 mL", "", "Armoire E; Etage E4"],
  [143, "Acide perchlorique", "—", "250 mL", "", "Armoire E; Etage E4"],
  [144, "Thiosulfate sodique", "—", "30 mL", "", "Armoire E; Etage E4"],
  [145, "Phénol", "77-61-4", "500 mL", "", "Armoire E - Étage E5"],
  [146, "Methylcyclohexane", "10887-2", "1 L", "", "Armoire E - Étage E5"],
  [147, "Methanol", "—", "400 mL", "", "Armoire E - Étage E5"],
  [148, "Styrenoxid", "96-09-3", "450 g", "", "Armoire E - Étage E5"],
  [149, "permanganete de potassiun", "—", "200 mL", "", "Armoire E - Étage E5"],
  [150, "tert-Butanol", "75-65-0", "200 mL", "", "Armoire E - Étage E5"],
  [151, "Isoamyl alcohol", "123-51-5", "2 L", "", "Armoire E - Étage E5"],
  [152, "Phosphoric acid", "—", "100 mL", "", "Armoire E - Étage E5"],
  [153, "Toluène", "28-615-295", "200 mL", "", "Armoire E - Étage E5"],
  [154, "Cyclohexanone", "—", "200 mL", "", "Armoire E - Étage E5"],
  [155, "Ethyl acetate (2 flacons)", "141-78-6", "500 mL / 150 mL", "", "Armoire E - Étage E5"],
  [156, "Ortho-phosphoric acid", "5294856", "800 mL", "", "Armoire E - Étage E5"],
  [157, "Ethanol absolut", "64-17-5", "100 mL", "", "Armoire E - Étage E5"],
  [158, "Hexane", "—", "150 mL", "", "Armoire E - Étage E5"],
  [159, "Methylhexane", "108-87-2", "1 L", "", "Armoire E - Étage E5"],
  [160, "tertio butanol", "8334/17", "200 mL", "", "Armoire E - Étage E5"],
  [161, "Methylcyclohexane", "108-87-2", "200 mL", "", "Armoire F - Étage F2"],
  [162, "Decane", "124-18-5", "500 mL", "", "Armoire F - Étage F2"],
  [163, "1-Hexane", "592-41-6", "1 L", "", "Armoire F - Étage F2"],

  // Page 7 (164-191)
  [164, "1-Octene", "111-66-0", "1 L", "", "Armoire F - Étage F2"],
  [165, "Ethyl acetate (2 flacons)", "27227", "300 mL", "", "Armoire F - Étage F2"],
  [166, "Cyclohexene / tert-Butanol", "—", "200 mL", "", "Armoire F - Étage F2"],
  [167, "Acide sulfurique (2 flacons)", "—", "—", "", "Armoire F - Étage F2"],
  [168, "Chloroform", "67-66-3", "200 mL", "", "Armoire F - Étage F3"],
  [169, "Petroleum ether", "—", "2 L", "", "Armoire F - Étage F3"],
  [170, "Acetone récup", "—", "—", "", "Armoire F - Étage F3"],
  [171, "Acetic acid", "64-19-7", "500 mL", "", "Armoire F - Étage F3"],
  [172, "Perchloric Acid", "77232", "200 mL", "", "Armoire F - Étage F3"],
  [173, "Nitric Acid", "7697-37-2", "100 mL", "", "Armoire F - Étage F4"],
  [174, "Hexane", "110-54-3", "100 mL", "", "Armoire F - Étage F4"],
  [175, "Styrene", "100-42-5", "300 mL", "", "Armoire F - Étage F4"],
  [176, "acide chloridrique", "—", "100 mL", "", "Armoire F - Étage F4"],
  [177, "Acide sulfurique", "141-78-6", "400 mL", "", "Armoire F - Étage F4"],
  [178, "Acide stéarique", "—", "1 kg", "", "Armoire F - Étage F4"],
  [179, "acide acetique", "—", "300 mL", "", "Armoire F - Étage F4"],
  [180, "Methanol", "67-56-1", "—", "", "Armoire F - Étage F4"],
  [181, "Acide HNO3 récupéré", "—", "100 mL", "", "Hotte- Labo R305"],
  [182, "Furfural", "—", "100 mL", "", "Hotte- Labo R305"],
  [183, "Huile de vaseline", "—", "1 L", "", "Hotte- Labo R305"],
  [184, "Hydrochloric acid", "7647-01-0", "100 mL", "", "Hotte- Labo R305"],
  [185, "Nitric Acid", "7697-37-2", "2.5 L", "", "Hotte- Labo R305"],
  [186, "2-Bromoethanol ( 2 flacons)", "540-51-2", "10 mL / 40 mL", "", "Frigo : P1"],
  [187, "Methyl chloroformate", "79-22-1", "90 mL", "", "Frigo"],
  [188, "Ethyl diacetoacetate", "603-69-0", "30 mL", "", "Frigo"],
  [189, "3-Hydroxy-3-methyl-2-butanone", "—", "15 mL", "", "Frigo"],
  [190, "tert-Butyldiphenylsilyl chloride", "58479-61-1", "5 mL", "", "Frigo"],
  [191, "C10H18O", "106-25-2", "80 mL", "", "Frigo"],

  // Page 8 (192-219)
  [192, "Trifluoromethanesulfonic acid", "1493-13-6", "5 mL", "", "Frigo"],
  [193, "Boron trifluorido diethyl etherate (2 flacons)", "109-63-7", "80 mL", "", "Frigo : p2"],
  [194, "Dibutylboron triflate in dichloromethane", "—", "40 mL", "", "Frigo"],
  [195, "(3-Mercaptopropyl)trimethoxysilan", "4420-74-0", "Vide", "", "Frigo : p3"],
  [196, "Hydrogen Peroxide, 35 wt. % sol. in water", "7722-84-1", "10 mL", "", "Frigo"],
  [197, "Propinaldehyde, reagent grade", "123-38-6", "200 mL", "", "Frigo"],
  [198, "Bis(3-aminopropyl)amine", "56-18-8", "50 mL", "", "Frigo"],
  [199, "3-Pyridinecarboxaldehyde", "500-22-1", "80 mL", "", "frigo : tirroir bas"],
  [200, "Tetrabutylammonium fluoride", "—", "40 mL", "", "frigo : tirroir bas"],
  [201, "3-Picolylamine", "3731-52-0", "80 mL", "", "frigo : tirroir bas"],
  [202, "Ethylenediamine", "107-15-3", "50 mL", "", "frigo : tirroir bas"],
  [203, "1,2-Diaminocyclohexane", "694-83-7", "100 mL", "", "frigo : tirroir bas"],
  [204, "2-Thiophenecarbox", "98-03-3", "8 mL", "", "frigo : tirroir bas"],
  [205, "Benzoyl chloride", "—", "180 mL", "", "frigo : tirroir bas"],
  [206, "1,4-Diaminobutane", "110-60-1", "100 mL", "", "frigo : tirroir bas"],
  [207, "Pyrrolidine", "123-75-1", "30 mL", "", "frigo : tirroir bas"],
  [208, "Trimethyl orthoformate", "149-73-5", "100 mL", "", "frigo : tirroir bas"],
  [209, "Crotyl alcohol", "6117-91-5", "20 mL", "", "frigo : tirroir bas"],
  [210, "1,1,3,3-Tetraethoxypropane", "—", "80 mL", "", "frigo : tirroir bas"],
  [211, "N-Methylcyclohexylamine", "100-60-7", "80 mL", "", "frigo : tirroir bas"],
  [212, "Oleyl alcohol, tech.", "143-28-2", "80 mL", "", "frigo : tirroir bas"],
  [213, "(3-Aminopropyl)triethoxysilane", "919-30-2", "2 mL", "", "frigo : tirroir bas"],
  [214, "Selectfluor", "140681-55-6", "10 g", "", "Frigo - Étage E1"],
  [215, "Trimethyl orthoacetate", "1445-45-0", "400 mL", "", "Frigo - Étage E1"],
  [216, "2,3-Butanedione", "431-03-8", "400 mL", "", "Frigo - Étage E1"],
  [217, "Acetaldehyde", "—", "300 mL", "", "Frigo - Étage E1"],
  [218, "1,4-Diaminobutane (2 flacons)", "—", "50 g", "", "Frigo - Étage E1"],
  [219, "Manganese(II) nitrate hydrate", "15710-66-6", "200 g", "", "Frigo - Étage E1"],

  // Page 9 (220-247)
  [220, "Allyl bromide", "106-95-6", "50 mL", "", "Frigo - Étage E1"],
  [221, "Allyl chloride", "107-05-1", "500 mL", "", "Frigo - Étage E1"],
  [222, "Propargyl chloride", "79-03-8", "400 mL", "", "Frigo - Étage E1"],
  [223, "1,8-Diaminooctane", "373-44-4", "50 g", "", "Frigo - Étage E1"],
  [224, "Propylamine", "107-10-8", "300 mL", "", "Frigo - Étage E1"],
  [225, "nitrate d'argent (2 flacons)", "—", "—", "", "Frigo - Étage E1"],
  [226, "hydroxyacetone", "116-09-6", "90 mL", "", "Frigo - Étage E2"],
  [227, "F moc-D-pro-OH", "101555-62-8", "2 g", "", "Frigo - Étage E2"],
  [228, "acetylendicarboxylic", "142-45-0", "2 g", "", "Frigo - Étage E2"],
  [229, "3-mercaptophenol", "402448-8-8", "2 mL", "", "Frigo - Étage E2"],
  [230, "methyloleate", "121-62-9", "3 mL", "", "Frigo - Étage E2"],
  [231, "sulfure de sodium nonahydrate", "—", "200 g", "", "Frigo - Étage E2"],
  [232, "Ammonium carbonate", "506-87-6", "500 g", "B U R E A U R 3 0 9", "R309 - Armoire 2, Étage E2"],
  [233, "Cerium(III) nitrate hexahydrate", "10294-41-4", "200 g", "", "R309 - Armoire 2, Étage E2"],
  [234, "Iron(III) nitrate nonahydrate", "7782-61-8", "500 g", "", "R309 - Armoire 2, Étage E2"],
  [235, "Zinc nitrate hexahydrate", "10196-18-6", "500 g", "", "R309 - Armoire 2, Étage E2"],
  [236, "Iron(II) sulfate heptahydrate", "7782-63-0", "1 kg", "", "R309 - Armoire 2, Étage E2"],
  [237, "Manganese(II) sulfate", "10034-96-5", "400 g", "", "R309 - Armoire 2, Étage E2"],
  [238, "Cobalt(II) chloride hexahydrate", "7791-13-1", "100 g", "", "R309 - Armoire 2, Étage E2"],
  [239, "Zinc acetate dihydrate", "5970-45-6", "500 g", "", "R309 - Armoire 2, Étage E2"],
  [240, "Nickel nitrate hexahydrate", "13478-00-7", "500 g", "", "R309 - Armoire 2, Étage E2"],
  [241, "Ferric nitrate nonahydrate", "7782-61-8", "500 g", "", "R309 - Armoire 2, Étage E2"],
  [242, "Cerium(IV) oxide powder", "1306-38-3", "5 g", "", "R309 - Armoire 2, Étage E2"],
  [243, "Lead nitrate", "10099-74-8", "500 g", "", "R309 - Armoire 2, Étage E2"],
  [244, "Lanthanum nitrate", "10277-43-7", "100 g", "", "R309 - Armoire 2, Étage E2"],
  [245, "Dodecanoic acid", "143-07-7", "700 g", "", "R309 - Armoire 2, Étage E2"],
  [246, "Hexamethylenetetramine", "100-97-0", "500 g", "", "R309 - Armoire 2, Étage E2"],
  [247, "Montmorillonite", "1318-93-0", "300 g", "", "R309 - Armoire 2, Étage E2"],

  // Page 10 (248-275)
  [248, "Zirconium(IV) butoxide solution", "1071-76-7", "500 mL", "", "R309 - Armoire 2, Étage E2"],
  [249, "Ethanol 96% vol (8 bouteilles)", "64-17-5", "2.5 L", "", "R309 - Armoire 2, Étage E2"],
  [250, "Methanol", "67-56-1", "2.5 L", "", "R309 - Armoire 2, Étage E2"],
  [251, "Ethanol absolu 99.9°", "64-17-5", "2.5 L", "", "R309 - Armoire 2, Étage E2"],
  [252, "Ammonia solution 32% (X4)", "—", "1 L", "", "R309 - Armoire 2, Étage E2"],
  [253, "Paracetamol", "—", "100 g", "", "Armoire 2, Étage E3"],
  [254, "Magnesium nitrate hexahydrate", "13446-18-9", "2.5 kg", "", "Armoire 2, Étage E3"],
  [255, "EDTA", "60-00-4", "500 g", "", "Armoire 2, Étage E3"],
  [256, "Urea", "57-13-6", "500 g", "", "Armoire 2, Étage E3"],
  [257, "Ammonium chloride", "12125-02-9", "0.5 kg", "", "Armoire 2, Étage E3"],
  [258, "Potassium hydroxide", "1310-58-3", "1 kg", "", "Armoire 2, Étage E3"],
  [259, "Aniline", "62-53-3", "500 mL", "", "Armoire 2, Étage E3"],
  [260, "Barium acetate", "543-80-6", "100 g", "", "Armoire 2, Étage E3"],
  [261, "Acetone", "67-64-1", "1 L", "", "Armoire 2, Étage E3"],
  [262, "Citric acid", "77-92-9", "500 g", "", "Armoire 2, Étage E3"],
  [263, "peroxide d'hydrogene", "7722-84-1", "1 L", "", "Armoire 2, Étage E3"],
  [264, "Zinc nitrate hexahydrate", "10196-18-6", "1 kg", "", "Armoire 2, Étage E3"],
  [265, "Calcium acetate", "114460-21-8", "500 g", "", "Armoire 2, Étage E3"],
  [266, "Aluminium nitrate nonahydrate", "7784-27-2", "1 kg", "", "Armoire 2, Étage E3"],
  [267, "Methyl blue", "61-73-4", "20 g", "", "Armoire 2, Étage E3"],
  [268, "Bromothymol blue", "76-59-5", "5 g", "", "Armoire 2, Étage E3"],
  [269, "Congo red", "573-58-0", "30 g", "", "Armoire 2, Étage E3"],
  [270, "Bromocresol", "115-40-2", "25 g", "", "Armoire 2, Étage E3"],
  [271, "Methyl orange", "547-58-0", "100 g", "", "Armoire 2, Étage E3"],
  [272, "Lead nitrate", "10099-74-8", "500 g", "", "Armoire 2, Étage E3"],
  [273, "Ammonium acetate", "631-61-8", "500 g", "", "Armoire 2, Étage E3"],
  [274, "Ammonium hydroxide", "1336-21-6", "1 L", "", "Armoire 2, Étage E3"],
  [275, "Calcium chloride dihydrate", "10035-04-8", "1 kg", "", "Armoire 2, Étage E3"],

  // Page 11 (276-303)
  [276, "Ammonium persulfate", "7727-54-0", "1 kg", "", "Armoire 2, Étage E3"],
  [277, "Ruthenium(III) acetylacetonate", "14284-93-6", "1 g", "", "Étage E4"],
  [278, "Ruthenium(IV) oxide", "12036-10-1", "1 g", "", "Étage E4"],
  [279, "Ruthenium(III) chloride hydrate", "14896-67-0", "5 g", "", "Étage E4"],
  [280, "Ruthenium standard", "—", "100 mL", "", "Étage E4"],
  [281, "Cyclohexene", "110-83-8", "20 mL", "", "Étage E4"],
  [282, "Cyclohexene oxide", "286-20-4", "30 mL", "", "Étage E4"],
  [283, "Vanadium(III) chloride", "7718-98-1", "5 g", "", "Étage E4"],
  [284, "Cobalt(III) acetylacetonate", "21679-46-9", "25 g", "", "Étage E4"],
  [285, "Ammonium cerium(IV) nitrate", "16774-21-3", "50 g", "", "Étage E4"],
  [286, "Silver nitrate (2 flacons)", "7761-88-8", "100 g", "", "Étage E4"],
  [287, "Cobalt(II) nitrate hexahydrate", "10026-22-9", "10 g", "", "Étage E4"],
  [288, "Cerium(IV) oxide", "1306-38-3", "25 g", "", "Étage E4"],
  [289, "2-Cyclohexene-1-one", "930-68-7", "10 mL", "", "Étage E4"],
  [290, "Vanadium(V) oxytripropoxide", "1686-23-3", "25 mL", "", "Étage E4"],
  [291, "Heptaldehyde", "111-71-7", "100 mL", "", "Étage E4"],
  [292, "Cyclohexyl acetate", "622-45-7", "100 mL", "", "Étage E4"],
  [293, "acide hexanoique", "142-62-1", "100 g", "", "Étage E4"],
  [294, "Montmorillonite", "139264-82-3", "25 g", "", "Étage E4"],
  [295, "N-Hydroxysuccinimide", "6066-82-6", "25 g", "", "Étage E4"],
  [296, "Mercury(II) sulfate", "—", "100 g", "", "Étage E4"],
  [297, "Sodium molybdate dihydrate", "10102-40-6", "100 g", "", "Étage E4"],
  [298, "Iron(III) oxide", "1309-37-1", "25 g", "", "Étage E4"],
  [299, "Cyclohexanol", "108-93-0", "100 mL", "", "Étage E4"],
  [300, "Decane", "124-18-5", "500 mL", "", "Étage E4"],
  [301, "Zirconium(IV) propoxide", "2351977-9", "5 g", "", "Étage E4"],
  [302, "Lead(II) acetate trihydrate", "6080-56-4", "25 g", "", "Étage E4"],
  [303, "Sodium phosphate dibasic", "7558-79-4", "100 g", "", "Étage E4"],

  // Page 12 (304-331)
  [304, "Chromium(III) nitrate nonahydrate", "7789-02-8", "100 g", "", "Étage E4"],
  [305, "Cyclohexanol", "108-93-0", "1 L", "", "Étage E4"],
  [306, "Ammonium persulfate", "7727-54-0", "0.5 kg", "", "Étage E4"],
  [307, "1-Butanol", "71-36-3", "1 L", "M A G A S I N", "Alcools & Dérivés / Divers (1)"],
  [308, "1,6-Hexandiol", "629-11-8", "150 g", "", "Alcools & Dérivés / Divers (1)"],
  [309, "1,4-Butandiol", "110-63-4", "1 L", "", "Alcools & Dérivés / Divers (1)"],
  [310, "Alcool butylique", "8334/17", "600 mL", "", "Alcools & Dérivés / Divers (1)"],
  [311, "Phénol", "108-95-2", "400 g", "", "Alcools & Dérivés / Divers (1)"],
  [312, "1,6-Hexandiol", "629-11-8", "500 g", "", "Alcools & Dérivés / Divers (1)"],
  [313, "1,2-Ethanedithiol (3 flacons)", "540-63-6", "100 mL", "", "Alcools & Dérivés / Divers (1)"],
  [314, "butylalcool", "71-36-3", "10 mL", "", "Alcools & Dérivés / Divers (1)"],
  [315, "2-Methyl-2-butanol", "200-908-9", "1 L", "", "Alcools & Dérivés / Divers (1)"],
  [316, "Diiodoethane", "75-11-6", "25 mL", "", "Alcools & Dérivés / Divers (1)"],
  [317, "Diphenyltri dichloride", "1135-99-5", "10 g", "", "Alcools & Dérivés / Divers (1)"],
  [318, "Dibromomethane", "74-95-3", "500 mL", "", "Alcools & Dérivés / Divers (1)"],
  [319, "Triethyl phosphate", "78-40-0", "100 mL", "", "Alcools & Dérivés / Divers (1)"],
  [320, "Benzyl chloride", "—", "500 mL", "", "Alcools & Dérivés / Divers (1)"],
  [321, "1-Bromobutane", "—", "250 mL", "", "Alcools & Dérivés / Divers (1)"],
  [322, "2-Bromo-2-methylpropane", "208-065-9", "1 L", "", "Alcools & Dérivés / Divers (1)"],
  [323, "Nickel chloride hexahydrate (2 flacons)", "7791-20-0", "500 g", "", "Sels des Métaux & Autres (1)"],
  [324, "Nickel nitrate hexahydrate", "13478-00-7", "500 g", "", "Sels des Métaux & Autres (1)"],
  [325, "Germanium(IV) chloride", "10038-98-9", "5 g", "", "Sels des Métaux & Autres (1)"],
  [326, "Zinc nitrate hexahydrate", "10196-18-6", "700 g", "", "Sels des Métaux & Autres (1)"],
  [327, "Copper(I) chloride", "7758-89-6", "10 g", "", "Sels des Métaux & Autres (1)"],
  [328, "Magnesium sulfate heptahydrate", "10034-99-8", "10 g", "", "Sels des Métaux & Autres (1)"],
  [329, "Magnesium acetate tetrahydrate", "16674-78-5", "100 g", "", "Sels des Métaux & Autres (1)"],
  [330, "Nickel(II) acetate", "—", "250 g", "", "Sels des Métaux & Autres (1)"],
  [331, "Tetraphenylarsonium chloride hydrate", "507-28-8", "10 g", "", "Sels des Métaux & Autres (1)"],

  // Page 13 (332-358)
  [332, "Potassium metaperiodate", "7790-21-8", "100 g", "", "Sels des Métaux & Autres (1)"],
  [333, "Ammonium molybdate", "—", "500 g", "", "Sels des Métaux & Autres (1)"],
  [334, "Palladium(II) nitrate dihydrate", "10102-05-3", "1 g", "", "Sels des Métaux & Autres (1)"],
  [335, "5-Hydroxymethylfurfural (2 flacons)", "67-47-0", "100 mg", "", "Sels des Métaux & Autres (1)"],
  [336, "Cerium(III) nitrate hexahydrate", "10294-11-4", "1 g", "", "Sels des Métaux & Autres (1)"],
  [337, "Cobalt(II) nitrate", "—", "250 g", "", "Sels des Métaux & Autres (1)"],
  [338, "Ammonium iron(II) sulfate hexahydrate", "7783-85-9", "100 g", "", "Sels des Métaux & Autres (1)"],
  [339, "Potassium dichromate", "7778-50-9", "500 g", "", "Sels des Métaux & Autres (1)"],
  [340, "Cobalt nitrate", "—", "100 g", "", "Sels des Métaux & Autres (1)"],
  [341, "Barium acetate", "543-80-6", "500 g", "", "Sels des Métaux & Autres (1)"],
  [342, "Barium chloride dihydrate", "—", "1 kg", "", "Sels des Métaux & Autres (1)"],
  [343, "Lead acetate trihydrate (2 flacons)", "—", "1 kg", "", "Sels des Métaux & Autres (1)"],
  [344, "Cobalt(II) nitrate hexahydrate", "—", "10 g", "", "Sels des Métaux & Autres (1)"],
  [345, "Chromium(III) chloride hexahydrate", "—", "100 g", "", "Sels des Métaux & Autres (1)"],
  [346, "Chromium(III) nitrate nonahydrate", "7789-02-8", "250 g", "", "Sels des Métaux & Autres (1)"],
  [347, "DL-Malic acid", "—", "100 g", "", "Acides & Composés Divers (ED4)"],
  [348, "p-Toluenesulfonyl chloride", "98-59-9", "1 kg", "", "Acides & Composés Divers (ED4)"],
  [349, "Ethylenediaminetetraacetic acid disodium salt dihydrate (X2)", "6381-92-6", "500 g + 1 kg", "", "Acides & Composés Divers (ED4)"],
  [350, "Chloroacetic acid", "—", "500 g", "", "Acides & Composés Divers (ED4)"],
  [351, "Ethylenediaminetetraacetic acid", "—", "70 g", "", "Acides & Composés Divers (ED4)"],
  [352, "Triethyl citrate, Kosher", "77-93-0", "1 kg", "", "Acides & Composés Divers (ED4)"],
  [353, "o-Toluic acid", "118-90-1", "400 g", "", "Acides & Composés Divers (ED4)"],
  [354, "Methyl 2-furoate Kosher", "611-13-2", "100 g", "", "Acides & Composés Divers (ED4)"],
  [355, "Citric acid", "77-92-9", "1 kg", "", "Acides & Composés Divers (ED4)"],
  [356, "Trimethyl orthoformate (2 flacons)", "149-73-5", "250 mL", "", "Acides & Composés Divers (ED4)"],
  [357, "Acetamide (2 flacons)", "60-35-5", "500 g", "", "Acides & Composés Divers (ED4)"],
  [358, "Valeric acid (4 flacons)", "109-52-4", "100 mL", "", "Acides & Composés Divers (ED4)"],

  // Page 14 (359-386)
  [359, "Mercurecerine sodique (2 flacons)", "—", "50 g", "", "ED5"],
  [360, "Carmin alune", "—", "30 g", "", "ED5"],
  [361, "sulfate de zinc", "—", "—", "", "ED5"],
  [362, "Lawesson reagent", "19172-47-5", "100 g", "", "ED5"],
  [363, "2-Methyl-2-propanol", "—", "5 L", "", "ED5"],
  [364, "Cyclopentane HPLC grade (2 flacons)", "287-92-3", "600 mL", "", "ED5"],
  [365, "Cyclohexane", "110-82-7", "1 L", "", "ED5"],
  [366, "Antimousse silicone", "—", "250 mL", "", "ED5"],
  [367, "3-Methylpentane", "96-14-0", "100 mL", "", "ED5"],
  [368, "Benzene", "—", "100 mL", "", "ED5"],
  [369, "N-bromosuccinimide", "128-08-5", "500 g", "", "ED5"],
  [370, "Zinc", "—", "1 kg", "", "Métaux & Divers"],
  [371, "Zinc", "—", "10 g", "", "Métaux & Divers"],
  [372, "Magnesium (2 flacons)", "—", "250 g", "", "Métaux & Divers"],
  [373, "Sodium hydrate", "7646-69-7", "100 g", "", "Métaux & Divers"],
  [374, "Bromine liquid", "7626-95-6", "250 g", "", "Métaux & Divers"],
  [375, "I2", "—", "—", "", "Métaux & Divers"],
  [376, "Diisopropyl ether", "108-20-3", "1 L", "", "Métaux & Divers"],
  [377, "4,4'-oxydianiline", "101-80-4", "100 g", "", "Aldéhyde"],
  [378, "Butyraldehyde", "123-72-8", "70 ml", "", "Aldéhyde"],
  [379, "2,3-Benzofuran", "271-89-6", "10 g", "", "Aldéhyde"],
  [380, "4-hydroxy-6-methyl-2-pyrone", "675-10-5", "25 g", "", "Aldéhyde"],
  [381, "2-Acetylcyclohexanone", "874-23-7", "25 g", "", "Aldéhyde"],
  [382, "2-propIn-1-ol", "/", "250 ml", "", "Aldéhyde"],
  [383, "Thioharnstoff", "/", "200 g", "", "Aldéhyde"],
  [384, "4-chlorobenzaldehyde", "/", "500 g", "", "Aldéhyde"],
  [385, "Furfural", "98-01-1", "50 ml", "", "Aldéhyde"],
  [386, "2,3-butanedione", "/", "200 g", "", "Cétone"],

  // Page 15 (387-414)
  [387, "Norbornene, 99%", "498-66-8", "100 g", "", "Cétone"],
  [388, "Glycine", "56-40-6", "250 g", "", "Cétone"],
  [389, "Benzophenone", "/", "400 g", "", "Cétone"],
  [390, "2,3-pentanedione", "600-14-6", "15 g", "", "Cétone"],
  [391, "pyrocatechol", "120-80-9", "100 g", "", "Cétone"],
  [392, "Acetyl Acetone", "120-3-54-6", "250 ml", "", "Cétone"],
  [393, "Acetylacetone", "123-54-6", "800 ml", "", "Cétone"],
  [394, "N-Benzylmethylamine", "103-77-3", "100 ml", "", "Amine"],
  [395, "pyridine", "110-86-1", "500 ml", "", "Amine"],
  [396, "1,3-diaminopropane", "109-86-2", "500 g", "", "Amine"],
  [397, "2(aminomethyl)piperidine", "22990-77-8", "25 g", "", "Amine"],
  [398, "2-picolylamine", "3731-51-9", "100 g", "", "Amine"],
  [399, "1-Methylimidazole", "616-47-7", "100 ml", "", "Amine"],
  [400, "pyrrolidin", "/", "25 ml", "", "Amine"],
  [401, "Hexamethylenediamine", "124-09-4", "500 g", "", "Amine"],
  [402, "Thiamine hydrochloride", "57-03-8", "100 g", "", "Amine"],
  [403, "Butylamine", "109-73-9", "1 L", "", "Amine"],
  [404, "4,4'-diaminodiphenylmethane", "101-77-9", "250 g", "", "Amine"],
  [405, "4-Pyridinecarbonitrile", "100-48-1", "100 g", "", "Amine"],
  [406, "sec-Butylamine", "13952-48-6", "500 ml", "", "Amine"],
  [407, "4-(dimethylamino)pyridine", "1122-58-3", "50 g", "", "Amine"],
  [408, "Selenium metal grey", "/", "25 g", "", "Amine"],
  [409, "Diphenylamine", "/", "0.5 g", "", "Amine"],
  [410, "Bis-(2-chloroethyl)-amine Hydrochloride", "821-48-7", "25 g", "", "Amine"],
  [411, "Triethylamine", "121-44-8", "500 ml", "", "Amine"],
  [412, "1,2-diaminopropane", "/", "100 g", "", "Amine"],
  [413, "Dimethylamine solution", "/", "1 L", "", "Amine"],
  [414, "2,2'-[Ethylenedioxy]bis[ethylamine]", "929-59-9", "100 ml", "", "Amine"],

  // Page 16 (415-442)
  [415, "pyrolpyrrolidine", "123-75-1", "100 ml", "", "Amine"],
  [416, "propylamine", "107-10-8", "1 L", "", "Amine"],
  [417, "phenethylamine", "64-04-0", "1 L", "", "Amine"],
  [418, "Anilin 99%", "62-53-3", "1 L", "", "Amine"],
  [419, "1,5-diaminonaphthalene", "2243-62-1", "10 g", "", "Amine"],
  [420, "Anilin 99%", "62-53-3", "1 L", "", "Amine"],
  [421, "Malonamide", "108-13-4", "60 g", "", "Acide carboxylique + Ester + Nitrile"],
  [422, "Succinic acid", "110-15-6", "60 g", "", "Acide carboxylique + Ester + Nitrile"],
  [423, "Dicyandiamide", "461-58-5", "500 g", "", "Acide carboxylique + Ester + Nitrile"],
  [424, "Malonic acid", "141-82-2", "500 g", "", "Acide carboxylique + Ester + Nitrile"],
  [425, "Diphenylacetic acid", "117-34-0", "50 g", "", "Acide carboxylique + Ester + Nitrile"],
  [426, "L-Aspartic acid", "56-84-8", "100 g", "", "Acide carboxylique + Ester + Nitrile"],
  [427, "4-Nitrophenylacetic acid", "104-03-0", "50 g", "", "Acide carboxylique + Ester + Nitrile"],
  [428, "Acrylic acid", "79-10-7", "60 g", "", "Acide carboxylique + Ester + Nitrile"],
  [429, "Lactic acid solution", "50-21-5", "800 g", "", "Acide carboxylique + Ester + Nitrile"],
  [430, "Fumaric acid", "110-17-8", "50 g", "", "Acide carboxylique + Ester + Nitrile"],
  [431, "Diethyl Succinate", "123-25-1", "250 g", "", "Acide carboxylique + Ester + Nitrile"],
  [432, "N,N-Dimethylacrylamide", "2680-03-7", "500 ml", "", "Acide carboxylique + Ester + Nitrile"],
  [433, "Aniline", "62-53-3", "100 ml", "", "Acide carboxylique + Ester + Nitrile"],
  [434, "Methyl cyanoacetate", "105-34-0", "2 kg", "", "Acide carboxylique + Ester + Nitrile"],
  [435, "Methyl 2,5-dimethyl-3-furancarboxylate", "6148-34-1", "50 ml", "", "Acide carboxylique + Ester + Nitrile"],
  [436, "Phosphomolybdic acid hydrate", "51429-74-4", "20 g", "", "Acide carboxylique + Ester + Nitrile"],
  [437, "Cyanoacetamide (4 flacon)", "107-91-5", "400 g", "", "Acide carboxylique + Ester + Nitrile"],
  [438, "Molybdophosphoric acid", "/", "30 g", "", "Acide carboxylique + Ester + Nitrile"],
  [439, "Ethyl acetoacetate (3 flacon)", "141-97-9", "1 L", "", "Acide carboxylique + Ester + Nitrile"],
  [440, "Methyl acrylate (2 flacon)", "96-33-3", "1 L", "", "Mixtes"],
  [441, "Decaethylene glycol monododecyl ether (2 flacon)", "6540-99-4", "500 g", "", "Mixtes"],
  [442, "Magnesium methoxide solution", "109-88-6", "500 ml", "", "Mixtes"],

  // Page 17 (443-469)
  [443, "Ethyl cyanoacetate (3 flacon )", "105-56-6", "1 kg - 600g -1Kg", "", "Mixtes"],
  [444, "Ethyl cyanoacetate", "/", "100 ml", "", "EE4"],
  [445, "Formamide", "75-12-7", "1 L", "", "EE4"],
  [446, "Tetramethylammonium hydroxide solution", "/", "1 L", "", "EE4"],
  [447, "Malononitrile", "109-77-3", "1 kg", "", "EE4"],
  [448, "Hexylamine", "111-25-2", "100 ml", "", "Acide"],
  [449, "Benzaldehyde", "100-52-7", "2.5 L", "", "Acide"],
  [450, "Manganese(IV) oxyde activated", "/", "1 kg", "", "Solide Support"],
  [451, "MgO", "1309-48-4", "130 g", "", "Solide Support"],
  [452, "Silica gel orange", "/", "500 g", "", "Solide Support"],
  [453, "Iron(III) oxide Powder (<5 micron), 99%", "1309-37-1", "300 g", "", "Solide Support"],
  [454, "Aluminum oxide", "1344-28-1", "1 kg", "", "Solide Support"],
  [455, "Zinc oxyde", "1314-13-2", "125 g", "", "Solide Support"],
  [456, "Gel de silice", "/", "/", "", "Solide Support"],
  [457, "Hydroxylamine hydrochloride", "5470-11-1", "500 g", "", "Solide Support"],
  [458, "Acetone", "", "2.5 L + 3/4 * 2.5 L", "", "Solvant"],
  [459, "Acetone (HPLC)", "", "2.5 L x 4", "", "Solvant"],
  [460, "Heptane", "", "1 L x 1 L", "", "Solvant"],
  [461, "Pentane", "", "500 ml", "", "Solvant"],
  [462, "Toluène", "", "2.5 L x 2 + 2 L", "", "Solvant"],
  [463, "Acétate d'éthyle", "", "5 x 1 L +2.5 L", "", "Solvant"],
  [464, "Tetrahydrofuranne", "", "2.5 L x 9 + 2 x 1 L", "", "Solvant"],
  [465, "2-propanol", "", "2 x 2.5 L + 1 L", "", "Solvant"],
  [466, "1-propanol", "", "11x 2.5 L + 3 x 1 L", "", "Solvant"],
  [467, "Acetonitrile (HPLC)", "", "2.5 L x 3", "", "Solvant"],
  [468, "Ethanol", "", "1/4 x2.5 L", "", "Solvant"],
  [469, "Dichloromethane 99.9", "", "3 x 2.5 L + 2,5 x 1 + 5 x 2.5 L", "", "Solvant"],

  // Page 18 (470-497)
  [470, "Petroleum ether", "", "2.5 L x 3", "", "Solvant"],
  [471, "Diethyl ether", "", "2.5 L x 3 + 1 L", "", "Solvant"],
  [472, "Methanol", "", "1 L", "", "Solvant"],
  [473, "Chloroforme", "", "2.5 L x 8", "", "Solvant"],
  [474, "Petroleum Benzin", "", "2.5 L", "", "Solvant"],
  [475, "Oleic Acid", "", "4 L", "", "Solvant"],
  [476, "N,N-dimethylformamide", "", "2.5 L x 4", "", "Solvant"],
  [477, "propomorte", "", "1 L", "", "Solvant"],
  [478, "N. oxyde d'aluminium", "", "500 g", "", "Solvant"],
  [479, "Hexane (crc)", "", "2.5 L", "", "Solvant"],
  [480, "n-Hexane", "", "4 x 2.5 L", "", "Solvant"],
  [481, "Pentane (crc)", "", "500 ml", "", "Solvant"],
  [482, "Methylcyclohexane (crc)", "", "7 x 1 L", "", "Solvant"],
  [483, "Methylcyclohexane (espagnol)", "", "1 L", "", "Solvant"],
  [484, "2-Methylpentane (99%)", "", "100 g", "", "Solvant"],
  [485, "Ethoxide de magnesium", "", "100 g", "", "Solvant"],
  [486, "Sodium hydride", "", "100 g", "", "Solvant"],
  [487, "Thiochloride sodium (99.9)", "", "100 ml", "", "Solvant"],
  [488, "Acrylic acid", "", "1 L", "", "Solvant"],
  [489, "cyclopentan", "", "2/3x 1 L", "", "Solvant"],
  [490, "Hexen", "", "1 L", "", "Solvant"],
  [491, "cyclohexene", "", "150 ml", "", "Solvant"],
  [492, "glycerole", "", "2.5 L", "", "Solvant"],
  [493, "1,4-Dioxone", "", "2.5 L", "", "Solvant"],
  [494, "2-Butanol", "", "14 x 1 L", "", "Solvant"],
  [495, "N,N-dimethylformamide", "", "1 L", "", "Solvant"],
  [496, "Acid nitrice", "", "1 L", "", "Solvant"],
  [497, "Formic Acid", "", "1 L", "", "Solvant"],

  // Page 19 (498-525)
  [498, "Hydroxide de sodium", "", "1 L", "", "Solvant"],
  [499, "Allylcyclopentane GC 98%", "", "100 ml x 10", "", "Solvant"],
  [500, "Phenol", "", "1 kg", "", "Solvant"],
  [501, "Diantimony IV oxyde solide", "", "100 g", "", "Solvant"],
  [502, "Ammonium acetate (7 flacons)", "631-61-8", "500 g", "", "Étagaire EF2"],
  [503, "Magnesium nitrate hexahydrate", "13446-18-9", "400 g", "", "Étagaire EF2"],
  [504, "Atropin sulfate monohydrate", "—", "25 g", "", "Étagaire EF2"],
  [505, "Hydroxylammonium chlorure", "—", "250 g", "", "Étagaire EF2"],
  [506, "Ammonium molybdate", "—", "800 g", "", "Étagaire EF2"],
  [507, "Barium nitrate pure", "—", "250 g", "", "Étagaire EF2"],
  [508, "Aluminium chloride", "—", "500 g", "", "Étagaire EF2"],
  [509, "Acide borique", "—", "500 g", "", "Étagaire EF2"],
  [510, "Calcium sulfate pure", "—", "1 Kg", "", "Étagaire EF2"],
  [511, "Natrium azide", "—", "100 g", "", "Étagaire EF2"],
  [512, "Magnesium sulfate", "1787-88-9", "500 g", "", "Étagaire EF2"],
  [513, "Potassium carbonate", "60310", "800 g", "", "Étagaire EF2"],
  [514, "Potassium carbonate (2 flacons)", "548-08-7", "1 kg", "", "Étagaire EF2"],
  [515, "Natrium tetraborate", "204825", "1 kg", "", "Étagaire EF2"],
  [516, "Sodium acetate", "—", "1 kg", "", "Étagaire EF2"],
  [517, "Sodium carbonate", "497-19-8", "350 g", "", "Étagaire EF2"],
  [518, "Potassium dichromate", "231-906-6", "500 g", "", "Étagaire EF2"],
  [519, "Sodium sulfate (2 flacons)", "7757-82-6", "500 g", "", "Étagaire EF2"],
  [520, "Calcium carbonate", "—", "300 g", "", "Étagaire EF2"],
  [521, "Sodium metabisulfite", "7681-57-4", "500 g", "", "Étagaire EF1"],
  [522, "Trisodium citrate dihydrate", "6132-04-3", "1 kg", "", "Étagaire EF1"],
  [523, "Kaliumaluminium sulfate (2 flacons)", "—", "1 kg", "", "Étagaire EF1"],
  [524, "Ammonium sulfate 18H2O (2 flacons)", "—", "1 kg", "", "Étagaire EF1"],
  [525, "Copper de sulfate", "—", "1 kg", "", "Étagaire EF1"],

  // Page 20 (526-553)
  [526, "Sodium phosphate monobasic", "7558-80-7", "1 kg", "", "Étagaire EF1"],
  [527, "Calcium sulfate", "—", "1 kg", "", "Étagaire EF1"],
  [528, "Sodium oxalate", "—", "1 kg", "", "Étagaire EF1"],
  [529, "Sodium acetate (3 flacons}", "127-09-3", "1 kg + 1 kg + 500 g", "", "Étagaire EF1"],
  [530, "Ammonium persulfate (2 flacons}", "7727-54-0", "1 kg", "", "Étagaire EF1"],
  [531, "Carbonate de chaux", "—", "—", "", "Étagaire EF1"],
  [532, "natriium carbonate", "—", "100 g", "", "Étagaire EF1"],
  [533, "Sulfate de cuivre", "—", "—", "", "Étagaire EF1"],
  [534, "Potassium phosphate dibasic", "7758-11-4", "1 kg", "", "Étagaire EF1"],
  [535, "Ammonium carbonate", "—", "1 kg", "", "Étagaire EF1"],
  [536, "Sodium sulfate decahydrate", "7727-73-3", "2.5 kg", "", "Étagaire EF1"],
  [537, "Potassium fluoride", "7789-23-3", "1 kg", "", "Étagaire EF0"],
  [538, "Bromure de potassium", "—", "—", "", "Étagaire EF0"],
  [539, "Cyclopentadiène", "—", "250 mL", "", "Étagaire EF0"],
  [540, "Natrium", "—", "500 g", "", "Étagaire EF0"],
  [541, "Carbone disulfure purifié", "75-15-0", "1 L", "", "Étagaire EF0"],
  [542, "1,4-Diazabicyclo[2.2.2]octane", "280-57-9", "200 g", "", "Étagaire EF0"],
  [543, "Gel de silice", "—", "500 g", "", "Étagaire EF0"],
  [544, "Naphtalène", "91-20-3", "800 g", "", "Étagaire EF0"],
  [545, "Butyl 4-hydroxybenzoate", "94-26-8", "500 g", "", "carton"],
  [546, "Calcium nitrate tetrahydrate", "13477-33-4", "500 g", "", "carton"],
  [547, "(3,5-dinitrosalicylic)", "609-99-4", "25 g", "", "carton"],
  [548, "Octylamine", "111-86-4", "100 g", "", "carton"],
  [549, "Phenylhydrazine hydrochloride", "59-88-1", "100 g", "", "carton"],
  [550, "N-(1-Naphthyl)ethylenediamine dihydrochloride", "1465-25-4", "25 g", "", "carton"],
  [551, "4-Dimethylaminobenzaldehyde", "100-10-7", "100 g", "", "carton"],
  [552, "4-Aminoacetophenone", "99-92-3", "100 g", "", "carton"],
  [553, "1-Iodopropane", "107-08-4", "100 g", "", "carton"],

  // Page 21 (554-578)
  [554, "Phenyl isothiocyanate", "103-72-0", "500 g", "", "carton"],
  [555, "2-Nitrobenzaldehyde", "552-89-6", "25 g", "", "carton"],
  [556, "Phosphorus pentoxide", "1314-56-3", "150 g", "", "carton"],
  [557, "Magnesium monohydrate", "145224-94-8", "25 g", "", "carton"],
  [558, "Magnesium hydroxide", "—", "1 kg", "", "Carton 2"],
  [559, "Sodium sulphate", "—", "1 g", "", "Carton 2"],
  [560, "Ammonium acetate", "—", "100 g", "", "Carton 2"],
  [561, "Ammonium carbonate", "—", "300 g", "", "Carton 2"],
  [562, "Sodium bicarbonate", "144-55-8", "100 g", "", "Carton 2"],
  [563, "Sodium thiosulfate anhydrous", "426-173-1", "10 g", "", "Carton 2"],
  [564, "Sodium iodide", "768-82-5", "10 g", "", "Carton 2"],
  [565, "Manganese chloride monohydrate", "64333-01-3", "1 kg", "", "Carton 2"],
  [566, "Potassium chloride", "7447-40-7", "100 g", "", "Carton 2"],
  [567, "Barium chloride dihydrate", "103-26-27-9", "250 g", "", "Carton 2"],
  [568, "Aluminium hydroxide", "—", "500 g", "", "Carton 2"],
  [569, "Calcium chloride dihydrate", "10043-52-4", "400 g", "", "Carton 2"],
  [570, "Chromium(III) chloride hexahydrate", "10060-12-5", "400 g", "", "Carton 2"],
  [571, "Iron(II) chloride", "7758-94-3", "12 g", "", "Carton 2"],
  [572, "Lanthanum(III) nitrate hydrate", "100587-94-8", "10 g", "", "Carton 2"],
  [573, "Cobalt(II) chloride hexahydrate", "7791-13-1", "90 g", "", "Carton 2"],
  [574, "Tin(II) chloride dihydrate", "10025-69-1", "2 g", "", "Carton 2"],
  [575, "Nickel(II) chloride", "7718-54-9", "20 g", "", "Carton 2"],
  [576, "NaCl", "—", "10 g", "", "Carton 2"],
  [577, "Mercuric chloride", "7487-94-7", "30 g", "", "Carton 2"],
  [578, "chlorure de cuivre", "7758-89-6", "10 g", "", "Carton 2"]
];

function parseQuantity(raw) {
  if (!raw || raw === '—' || raw === '/' || raw === 'Vide' || raw === '0') {
    return { qty: 0, unit: 'g' };
  }
  const clean = raw.trim();
  // Check for expressions like "2.5 L x 3" -> 7500 mL
  const multMatch = clean.match(/^([\d.]+)\s*L\s*x\s*([\d.]+)/i);
  if (multMatch) {
    return { qty: parseFloat(multMatch[1]) * parseFloat(multMatch[2]) * 1000, unit: 'mL' };
  }
  // Check for "1 L + 500 mL" -> 1500 mL
  if (clean.includes('L +') || clean.includes('L+')) {
    const parts = clean.split('+');
    let totalMl = 0;
    for (const p of parts) {
      if (/L/i.test(p)) totalMl += (parseFloat(p) || 0) * 1000;
      else if (/mL/i.test(p)) totalMl += parseFloat(p) || 0;
    }
    return { qty: totalMl || 1000, unit: 'mL' };
  }
  // Check for "kg"
  const kgMatch = clean.match(/^([\d.]+)\s*kg/i);
  if (kgMatch) {
    return { qty: parseFloat(kgMatch[1]) * 1000, unit: 'g' };
  }
  // Check for "L"
  const lMatch = clean.match(/^([\d.]+)\s*L/i);
  if (lMatch) {
    return { qty: parseFloat(lMatch[1]) * 1000, unit: 'mL' };
  }
  // Check for "mL" or "ml"
  const mlMatch = clean.match(/^([\d.]+)\s*m[lL]/i);
  if (mlMatch) {
    return { qty: parseFloat(mlMatch[1]), unit: 'mL' };
  }
  // Check for "g"
  const gMatch = clean.match(/^([\d.]+)\s*g/i);
  if (gMatch) {
    return { qty: parseFloat(gMatch[1]), unit: 'g' };
  }
  // Check for "mg"
  const mgMatch = clean.match(/^([\d.]+)\s*mg/i);
  if (mgMatch) {
    return { qty: parseFloat(mgMatch[1]), unit: 'mg' };
  }
  const num = parseFloat(clean);
  if (!isNaN(num)) {
    return { qty: num, unit: 'g' };
  }
  return { qty: 100, unit: 'g' };
}

function parseLocation(emp, labo, index) {
  let room = (labo || '').replace(/\s+/g, ' ').trim() || 'R302';
  let unit = 'Armoire C';
  let shelf = '1';
  let side = 'Left';

  if (!emp || emp === '/') {
    unit = 'Armoire C';
    shelf = 'C1.5';
    room = 'R302';
  } else if (/Armoire C/i.test(emp)) {
    unit = 'Armoire C';
    room = 'R302';
    if (/C1\.4/i.test(emp)) shelf = 'C1.4';
    else shelf = 'C1.5';
  } else if (/Frigo A1/i.test(emp)) {
    unit = 'Frigo A1';
    room = 'R303';
    const m = emp.match(/[DPE]\d+/i);
    shelf = m ? m[0].toUpperCase() : 'D1';
  } else if (/Frigo A2/i.test(emp)) {
    unit = 'Frigo A2';
    room = 'R303';
    shelf = 'E3';
  } else if (/Paillasse/i.test(emp)) {
    unit = 'Paillasse R303';
    room = 'R303';
    shelf = '1';
  } else if (/Armoire HPLC/i.test(emp)) {
    unit = 'Armoire HPLC';
    room = 'R303';
    shelf = '1';
  } else if (/Armoire E/i.test(emp)) {
    unit = 'Armoire E';
    room = 'R305';
    const m = emp.match(/E[1-5]/i);
    shelf = m ? m[0].toUpperCase() : 'E1';
  } else if (/Armoire F/i.test(emp)) {
    unit = 'Armoire F';
    room = 'R305';
    const m = emp.match(/F[2-4]/i);
    shelf = m ? m[0].toUpperCase() : 'F2';
  } else if (/Hotte/i.test(emp)) {
    unit = 'Hotte R305';
    room = 'R305';
    shelf = '1';
  } else if (/Frigo/i.test(emp)) {
    unit = 'Frigo Labo';
    room = 'R303';
    if (/tirroir/i.test(emp)) shelf = 'Tiroir Bas';
    else if (/E[12]/i.test(emp)) shelf = emp.match(/E[12]/i)[0].toUpperCase();
    else if (/P\d+/i.test(emp)) shelf = emp.match(/P\d+/i)[0].toUpperCase();
    else shelf = '1';
  } else if (/R309|Bureau/i.test(emp) || /BUREAU R309/i.test(labo)) {
    unit = 'Armoire 2 (R309)';
    room = 'Bureau R309';
    const m = emp.match(/E[2-4]/i);
    shelf = m ? m[0].toUpperCase() : 'E2';
  } else if (/Armoire 2/i.test(emp)) {
    unit = 'Armoire 2 (R309)';
    room = 'Bureau R309';
    const m = emp.match(/E[2-4]/i);
    shelf = m ? m[0].toUpperCase() : 'E3';
  } else if (/Étage E4/i.test(emp)) {
    unit = 'Armoire 2 (R309)';
    room = 'Bureau R309';
    shelf = 'E4';
  } else if (/MAGASIN|Alcools|Sels|Acides|ED4|ED5|Métaux|Aldéhyde|Cétone|Amine|Mixtes|EE4|Solide|Solvant/i.test(emp) || /MAGASIN/i.test(labo)) {
    room = 'Magasin';
    if (/Alcools/i.test(emp)) unit = 'Rayon Alcools & Dérivés';
    else if (/Sels des Métaux/i.test(emp)) unit = 'Rayon Sels & Métaux';
    else if (/Acides|ED4/i.test(emp)) unit = 'Rayon Acides & Composés';
    else if (/ED5/i.test(emp)) unit = 'Armoire ED5';
    else if (/Métaux & Divers/i.test(emp)) unit = 'Rayon Métaux & Divers';
    else if (/Aldéhyde/i.test(emp)) unit = 'Rayon Aldéhydes';
    else if (/Cétone/i.test(emp)) unit = 'Rayon Cétones';
    else if (/Amine/i.test(emp)) unit = 'Rayon Amines';
    else if (/Acide carboxylique/i.test(emp)) unit = 'Rayon Acides & Esters';
    else if (/Mixtes/i.test(emp)) unit = 'Rayon Mixtes';
    else if (/EE4/i.test(emp)) unit = 'Armoire EE4';
    else if (/Solide Support/i.test(emp)) unit = 'Rayon Solide Support';
    else if (/Solvant/i.test(emp)) unit = 'Stock Solvants';
    else unit = 'Magasin Général';
    shelf = '1';
  } else if (/Étagaire EF/i.test(emp)) {
    unit = 'Étagère EF';
    room = 'Magasin';
    const m = emp.match(/EF[012]/i);
    shelf = m ? m[0].toUpperCase() : 'EF1';
  } else if (/carton/i.test(emp)) {
    unit = /Carton 2/i.test(emp) ? 'Carton 2' : 'Carton 1';
    room = 'Magasin';
    shelf = '1';
  }

  const pos = String((index % 25) + 1).padStart(2, '0');
  const code = `${unit}- Level ${shelf}- ${side} side`;

  return { room, unit, shelf, side, pos, code };
}

function classifyChemical(name, emp) {
  const n = (name || '').toLowerCase();
  const e = (emp || '').toLowerCase();

  if (e.includes('solvant') || /acetone|hexane|ether|cyclohexane|benzene|tolu|methanol|ethanol|propanol|butanol|chloroform|thf|decane|pentane|dcm|dichloromethane/i.test(n)) {
    return { group: 'Solvents', storageClass: 'Flammable solvent' };
  }
  if (e.includes('acide') || /acid|chloridrique|sulfurique|nitric|hcl|hno3|h2so4/i.test(n)) {
    return { group: 'Acids', storageClass: 'Corrosive acid' };
  }
  if (e.includes('amine') || /amine|pyridine|aniline|piperidine/i.test(n)) {
    return { group: 'Amines', storageClass: 'Corrosive base' };
  }
  if (e.includes('cétone') || /cétone|ketone|butanedione|pentanedione|acetophenone|benzophenone/i.test(n)) {
    return { group: 'Ketones', storageClass: 'General storage' };
  }
  if (e.includes('aldéhyde') || /aldehyde|furfural|acrolein/i.test(n)) {
    return { group: 'Aldehydes', storageClass: 'General storage' };
  }
  if (e.includes('ester') || /acetate|benzoate|succinate|acrylate/i.test(n)) {
    return { group: 'Esters', storageClass: 'Flammable solvent' };
  }
  if (e.includes('sels') || /chloride|sulfate|nitrate|carbonate|phosphate|acetate|oxide|hydrate/i.test(n)) {
    return { group: 'Salts', storageClass: 'General storage' };
  }
  return { group: 'Other', storageClass: 'General storage' };
}

const products = [];
const containers = [];
const locationMap = new Map();

RAW_ROWS.forEach(([num, name, cas, rawQty, labo, emp], idx) => {
  const { qty, unit } = parseQuantity(rawQty);
  const loc = parseLocation(emp, labo, idx);
  const { group, storageClass } = classifyChemical(name, emp);

  const prodId = `PDF21-PROD-${String(num).padStart(3, '0')}`;
  const contId = `REA-21P-${String(num).padStart(3, '0')}`;
  const cleanCas = cas && cas !== '—' && cas !== '/' ? cas.trim() : '';

  if (!locationMap.has(loc.unit)) {
    locationMap.set(loc.unit, {
      id: `LOC-${loc.unit.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase()}`,
      room: loc.room,
      cabinet: loc.unit,
      cabinetLabel: `${loc.unit} (${loc.room})`,
      storageClassification: storageClass,
      sides: ['Left', 'Right'],
      shelves: new Set([loc.shelf]),
      positions: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
      reagentClasses: [group]
    });
  } else {
    const existing = locationMap.get(loc.unit);
    existing.shelves.add(loc.shelf);
    if (!existing.reagentClasses.includes(group)) {
      existing.reagentClasses.push(group);
    }
  }

  const effectiveInit = qty > 0 ? qty : 500;
  const status = qty <= 0 ? 'NEARLY_EMPTY' : (qty <= 20 ? 'LOW_STOCK' : 'NORMAL');

  products.push({
    productId: prodId,
    chemicalName: name,
    casNumber: cleanCas || 'N/A',
    formula: 'N/A',
    molecularWeight: 100,
    hazardClass: ['GHS07 Irritant'],
    storageRequirements: `${loc.code}`,
    defaultUnit: unit,
    minimumStock: Math.round(effectiveInit * 0.2),
    reorderLevel: Math.round(effectiveInit * 0.4),
    sdsUrl: cleanCas
      ? `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(cleanCas)}`
      : `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(name)}`,
    createdAt: '2026-10-14T02:00:00Z',
    updatedAt: '2026-10-14T02:00:00Z',
    chemicalClassification: group,
    storageClassification: storageClass
  });

  containers.push({
    containerId: contId,
    productId: prodId,
    laboratoryId: 'LCSCO',
    initialQuantity: effectiveInit,
    currentQuantity: qty,
    unit: unit,
    location: {
      building: 'LCSCO',
      room: loc.room,
      unit: loc.unit,
      cabinetLabel: `${loc.unit} (${loc.room})`,
      side: loc.side,
      shelf: loc.shelf,
      position: loc.pos,
      code: loc.code
    },
    storageCondition: `${loc.code}`,
    status: status,
    lotNumber: `PDF21-${String(num).padStart(3, '0')}`,
    supplier: 'LCSCO Inventory',
    expiryDate: '2028-12-31',
    createdAt: '2026-10-14T02:00:00Z',
    updatedAt: '2026-10-14T02:00:00Z',
    createdBy: 'temp-director',
    chemicalClassification: group,
    storageClassification: storageClass
  });
});

const physicalLocations = Array.from(locationMap.values()).map(loc => ({
  ...loc,
  shelves: Array.from(loc.shelves)
}));

const outPath = path.resolve('./src/data/pdf21PagesData.ts');
const fileContent = `/**
 * Extended 21-Page Official LCSCO Laboratory Chemical Inventory (Items 1 to 578)
 * Combined with the existing inventory.
 */
import { ChemicalContainer, PhysicalLocationConfig, Product } from '../types/inventory';

export const PDF21_PHYSICAL_LOCATIONS: PhysicalLocationConfig[] = (${JSON.stringify(physicalLocations, null, 2)}) as any;

export const PDF21_PRODUCTS: Product[] = (${JSON.stringify(products, null, 2)}) as any;

export const PDF21_CONTAINERS: ChemicalContainer[] = (${JSON.stringify(containers, null, 2)}) as any;
`;

fs.writeFileSync(outPath, fileContent, 'utf-8');
console.log(`Generated ${products.length} products, ${containers.length} containers, and ${physicalLocations.length} locations in ${outPath}`);
