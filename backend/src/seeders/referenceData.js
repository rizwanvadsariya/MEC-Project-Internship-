// Reference data for the ADP-sourced collections.
//
// Departments: the 45 line departments from the ADP index (schema file 2.1),
// plus the 5 special block allocations the book carries alongside them.
// Sub-sectors: the schema file only spells out the breakdown for Agriculture
// and Education (2.2); those are seeded here. Other departments' sub-sectors
// are loaded with the real ADP ledger import and are intentionally left empty.
// Districts: the schema file names only example districts (2.3); the canonical
// list of Sindh districts is used here.

const DEPARTMENTS = [
	{ name: "Agriculture, Supply & Prices", adpSerialNo: 1 },
	{ name: "Auqaf, Religious Affairs, Zakat & Ushr", adpSerialNo: 2 },
	{ name: "Board of Revenue", adpSerialNo: 3 },
	{ name: "Culture, Tourism, Antiquities & Archives", adpSerialNo: 4 },
	{ name: "Education Sector", adpSerialNo: 5 },
	{ name: "Energy", adpSerialNo: 6 },
	{ name: "Environment, Climate Change & Coastal Development", adpSerialNo: 7 },
	{ name: "Excise, Taxation & Narcotics Control", adpSerialNo: 8 },
	{ name: "Finance", adpSerialNo: 9 },
	{ name: "Food", adpSerialNo: 10 },
	{ name: "Forest & Wildlife", adpSerialNo: 11 },
	{ name: "Governor's Secretariat", adpSerialNo: 12 },
	{ name: "Health", adpSerialNo: 13 },
	{ name: "Home", adpSerialNo: 14 },
	{ name: "Human Rights", adpSerialNo: 15 },
	{ name: "Human Settlement, Spatial Development & Social Housing", adpSerialNo: 16 },
	{ name: "Industries & Commerce", adpSerialNo: 17 },
	{ name: "Information", adpSerialNo: 18 },
	{ name: "Irrigation", adpSerialNo: 19 },
	{ name: "Labour & Human Resources", adpSerialNo: 20 },
	{ name: "Law, P.A and Prosecution", adpSerialNo: 21 },
	{ name: "Livestock & Fisheries", adpSerialNo: 22 },
	{ name: "Local Government, Housing & Town Planning", adpSerialNo: 23 },
	{ name: "Matching Allocations", adpSerialNo: 24 },
	{ name: "Mega Projects for Karachi City", adpSerialNo: 25 },
	{ name: "Mines & Mineral Development", adpSerialNo: 26 },
	{ name: "Minorities Affairs", adpSerialNo: 27 },
	{ name: "Planning & Development", adpSerialNo: 28 },
	{ name: "Population Welfare", adpSerialNo: 29 },
	{ name: "Provincial Assembly", adpSerialNo: 30 },
	{ name: "Provincial Ombudsman", adpSerialNo: 31 },
	{ name: "Public Health Engineering & Rural Development", adpSerialNo: 32 },
	{ name: "Rehabilitation (PDMA)", adpSerialNo: 33 },
	{ name: "Science & Information Technology", adpSerialNo: 34 },
	{ name: "Services, General Administration & Coordination", adpSerialNo: 35 },
	{ name: "Sindh Public Service Commission", adpSerialNo: 36 },
	{ name: "Sindh Revenue Board", adpSerialNo: 37 },
	{ name: "Social Protection", adpSerialNo: 38 },
	{ name: "Social Welfare", adpSerialNo: 39 },
	{ name: "Sports & Youth Affairs", adpSerialNo: 40 },
	{ name: "Thar Coal Infrastructure Development", adpSerialNo: 41 },
	{ name: "Training, Management & Research", adpSerialNo: 42 },
	{ name: "Transport and Mass Transit", adpSerialNo: 43 },
	{ name: "Women Development", adpSerialNo: 44 },
	{ name: "Works & Services", adpSerialNo: 45 },
];

const BLOCK_ALLOCATIONS = [
	{ name: "Allocation for Divisional Headquarters" },
	{ name: "Special Initiatives for Backward Districts" },
	{ name: "Block Allocation for New Schemes" },
	{ name: "Block Allocation for Foreign Funded Projects" },
	{ name: "Block Allocation for District ADP" },
];

// department name -> sub-sector names
const SUB_SECTORS = {
	"Agriculture, Supply & Prices": [
		"Agriculture Research",
		"Agriculture Water Management",
		"Agriculture Extension",
		"Agriculture Marketing",
	],
	"Education Sector": [
		"College Education",
		"DEPD",
		"School Education & Literacy",
		"STEVTA",
		"Universities and Boards",
	],
};

const DISTRICTS = [
	"Badin",
	"Dadu",
	"Ghotki",
	"Hyderabad",
	"Jacobabad",
	"Jamshoro",
	"Karachi Central",
	"Karachi East",
	"Karachi South",
	"Karachi West",
	"Kashmore",
	"Keamari",
	"Khairpur",
	"Korangi",
	"Larkana",
	"Malir",
	"Matiari",
	"Mirpur Khas",
	"Naushahro Feroze",
	"Qambar Shahdadkot",
	"Sanghar",
	"Shaheed Benazirabad",
	"Shikarpur",
	"Sujawal",
	"Sukkur",
	"Tando Allahyar",
	"Tando Muhammad Khan",
	"Tharparkar",
	"Thatta",
	"Umerkot",
];

module.exports = { DEPARTMENTS, BLOCK_ALLOCATIONS, SUB_SECTORS, DISTRICTS };
