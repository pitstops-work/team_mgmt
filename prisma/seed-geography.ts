import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Data extracted from City Zone Cluster Settlement List.xlsx
const data: { city: string; zone: string; cluster: string; settlement: string }[] = [
  { city: "Chennai", zone: "Central", cluster: "Central Chennai", settlement: "Aalayamman Kovil" },
  { city: "Chennai", zone: "Central", cluster: "Central Chennai", settlement: "Dr. Thomas Road" },
  { city: "Chennai", zone: "Central", cluster: "Central Chennai", settlement: "Giriyappa Road" },
  { city: "Chennai", zone: "Central", cluster: "Central Chennai", settlement: "MK Ratha Nagar" },
  { city: "Chennai", zone: "Central", cluster: "Central Chennai", settlement: "Sathyamurthy Nagar" },
  { city: "Chennai", zone: "Central", cluster: "Fort & Park", settlement: "Annai Sathyanagar (B Block)" },
  { city: "Chennai", zone: "Central", cluster: "Fort & Park", settlement: "Annai Sathyanagar (C Block)" },
  { city: "Chennai", zone: "Central", cluster: "Fort & Park", settlement: "Pallavan Salai" },
  { city: "Chennai", zone: "Central", cluster: "Fort & Park", settlement: "Mylapur & Marina Coastal" },
  { city: "Chennai", zone: "Central", cluster: "Fort & Park", settlement: "Neelam Badsha Dargha Street" },
  { city: "Chennai", zone: "Central", cluster: "Fort & Park", settlement: "Pattinapakkam" },
  { city: "Chennai", zone: "Central", cluster: "Fort & Park", settlement: "VR Pillai street" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "Dr. Ambedkar Nagar" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "Gandhi Nagar (Puliyanthope)" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "J.J. Nagar (Puliyanthope)" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "K.M. Garden" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "Kasthuri Bai Colony" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "Narasimma Nagar" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "New Thiru Vi Ka Nagar" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "Ponnappan Street" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "Sasthiri Nagar" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "Sundhara Puram" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "T.V.K. Nagar" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "V.O.C. Nagar" },
  { city: "Chennai", zone: "Central", cluster: "Pulianthope", settlement: "Vasugi Nagar" },
  { city: "Chennai", zone: "North", cluster: "Royapuram–Harbour", settlement: "Ambedkar Nagar" },
  { city: "Chennai", zone: "North", cluster: "Royapuram–Harbour", settlement: "Bojaraja Nagar" },
  { city: "Chennai", zone: "North", cluster: "Royapuram–Harbour", settlement: "Canal Street (Royapuram)" },
  { city: "Chennai", zone: "North", cluster: "Royapuram–Harbour", settlement: "Muthumarriyamman Nagar" },
  { city: "Chennai", zone: "North", cluster: "Royapuram–Harbour", settlement: "R.R. Nagar" },
  { city: "Chennai", zone: "North", cluster: "Royapuram–Harbour", settlement: "Railway Colony" },
  { city: "Chennai", zone: "North", cluster: "Royapuram–Harbour", settlement: "Stanley Nagar" },
  { city: "Chennai", zone: "Resettlement", cluster: "Semmenchery", settlement: "Semmencherry" },
  { city: "Chennai", zone: "North", cluster: "Tiruvottiyur", settlement: "Appar Nagar" },
  { city: "Chennai", zone: "North", cluster: "Tiruvottiyur", settlement: "Apparsami Kovil" },
  { city: "Chennai", zone: "North", cluster: "Tiruvottiyur", settlement: "J.J. Nagar (Thiruvottiyur)" },
  { city: "Chennai", zone: "North", cluster: "Tiruvottiyur", settlement: "Kalyani Chetty Nagar" },
  { city: "Chennai", zone: "North", cluster: "Tiruvottiyur", settlement: "Kanni Kovil" },
  { city: "Chennai", zone: "North", cluster: "Tiruvottiyur", settlement: "Pattinathar Kovil" },
  { city: "Chennai", zone: "North", cluster: "Tiruvottiyur", settlement: "Thulukanathamman Kovil" },
  { city: "Chennai", zone: "North", cluster: "Vyasarpadi", settlement: "B. Kalyanapuram" },
  { city: "Chennai", zone: "North", cluster: "Vyasarpadi", settlement: "C. Kalyanapuram" },
  { city: "Chennai", zone: "North", cluster: "Vyasarpadi", settlement: "Desikanandhapuram" },
  { city: "Chennai", zone: "North", cluster: "Vyasarpadi", settlement: "Dhebar Nagar" },
  { city: "Chennai", zone: "North", cluster: "Vyasarpadi", settlement: "Gandhipuram" },
  { city: "Chennai", zone: "North", cluster: "Vyasarpadi", settlement: "MM Garden" },
  { city: "Chennai", zone: "North", cluster: "Vyasarpadi", settlement: "Sundram Powerline" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "AK Colony" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Ashreya Yojane" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Ayodyanagar" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Bilwaradahalli" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Bydara beedi (Vishweshwarayya badawane)" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Gollalli gutte" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Hakki pikki colony" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Jagjeevanram nagar" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Kyasaraguppe" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Muslim Colony" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Narayanapura" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Pillaganahalli" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Pump house" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Ramachandra nagar" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Seepkere" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Shilidradoddi" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Siddarth nagar" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Sudham Nagar" },
  { city: "Bangalore", zone: "South", cluster: "Anekal", settlement: "Thigalara Beedi" },
  { city: "Bangalore", zone: "North", cluster: "Bagalur", settlement: "Bagalur" },
  { city: "Bangalore", zone: "North", cluster: "Bagalur", settlement: "Bagalur Colony" },
  { city: "Bangalore", zone: "North", cluster: "Bagalur", settlement: "Bs Palya" },
  { city: "Bangalore", zone: "North", cluster: "Bagalur", settlement: "Razakpalya" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Babureddy community KA" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Bellandur Hindi Community" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Bellandur kannada Community" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Bellanduru Doddamma Temple Back Side (2 camp)" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Bellanduru Hindi Vatara" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Boganahalli Community" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Haralur Road 3 sites" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Huligappa Community KA" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Jahangir Bangla Community (Jalaluddin) KA" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Junnasandhra School Community, 2 sites" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Jyothika Behind Debris" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Kaikondrahalli Near SBM Bank" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Kannada Community Near AET College" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Kariyammana agrahara Vatara KA (Kannada + Hindi)" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Khalikatta" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Kudrath Community" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Mantri Espana- Sakra Road 4 sites KA" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Weigh Bridge Community" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Yalamma Temple Community KA" },
  { city: "Bangalore", zone: "South", cluster: "Bellandur", settlement: "Zakir Bangla community KA" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Amruthahalli" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Behind Govt Hr Primary School, Dasarahalli" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Behind Manyata Tech Park" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Bhimanna Garden" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Chiranjeevi Layout" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Dasarahalli Main Road around BBMP Office" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Defence Layout" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Hoysala Layout" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Jakkuru Layout" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Kariyanna Layout" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Kashinagara" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Kuvempu Layout" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Manyata Tech Park Road" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Mariyannapalya" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Near Ganesha Temple, Rachenahalli" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Rachenahalli Lake" },
  { city: "Bangalore", zone: "North", cluster: "Byatarayanapura", settlement: "Veerannapalya" },
  { city: "Bangalore", zone: "West", cluster: "Dasarahalli", settlement: "Ashwathpura" },
  { city: "Bangalore", zone: "West", cluster: "Dasarahalli", settlement: "Chokkasandra Village" },
  { city: "Bangalore", zone: "West", cluster: "Dasarahalli", settlement: "Muneshwara Block" },
  { city: "Bangalore", zone: "West", cluster: "Dasarahalli", settlement: "Muniswamy Ground" },
  { city: "Bangalore", zone: "West", cluster: "Dasarahalli", settlement: "Narayanapura" },
  { city: "Bangalore", zone: "West", cluster: "Dasarahalli", settlement: "Ravindra Nagara" },
  { city: "Bangalore", zone: "North", cluster: "Hebbal", settlement: "Kempapura" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Ambedkar Colony" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Fakeer Colony-Fakeer" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Fakeer Colony-Others" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Ittige Factory" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Jai Bhim Nagara" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Jakkuru (Near Jakkur Aarogya Kendra)" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Sandeep Layout" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Surabhi Layout-Kannada" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Surabhi Layout-Telugu" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Thirumenahalli" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Vishwavani Nagara" },
  { city: "Bangalore", zone: "North", cluster: "Jakkur", settlement: "Waseem Layout" },
  { city: "Bangalore", zone: "South", cluster: "Jayanagar", settlement: "Corporation Colony" },
  { city: "Bangalore", zone: "South", cluster: "Jayanagar", settlement: "Gundappa Colony" },
  { city: "Bangalore", zone: "South", cluster: "Jayanagar", settlement: "Indira G colony" },
  { city: "Bangalore", zone: "South", cluster: "Jayanagar", settlement: "Kaveramma temple" },
  { city: "Bangalore", zone: "South", cluster: "Jayanagar", settlement: "Ragigudda I" },
  { city: "Bangalore", zone: "South", cluster: "Jayanagar", settlement: "Ragigudda II" },
  { city: "Bangalore", zone: "South", cluster: "Jayanagar", settlement: "Thilaknagar" },
  { city: "Bangalore", zone: "South", cluster: "Jayanagar", settlement: "Urs colony" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "7th & 8th Mn Rd Padarayanapura" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "AK Badavane" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "AK Colony" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Arfath Nagar I & II" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Ashwath Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Boomatha Seva Sangha" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Devarajurs Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Farookhiya Nagar I & II" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Gada" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Janata Colony" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Keshava Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "MCT Colony" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Nagamma Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Narasimaiah Colony" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Sanjay Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Vinayaka Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "JJR Nagar", settlement: "Vinny Colony" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Arundathinagar" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Beedi colony" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Bhadrapura" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Bheemana kuppe" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Doddbele colony" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Gandhi Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Gowripura" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Hospalya" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Kabbalamma palya" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Kanminke" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Kasturamma Badavane" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Shirke" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Shivakumar Swamiji nagar" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Shivanagar colony" },
  { city: "Bangalore", zone: "West", cluster: "Kengeri", settlement: "Subbarayanapalya" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Ambedkar nagar I" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Ambedkar nagar II" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Ambedkar nagar III" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Geetanajali" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Indira Gandhi slum Ejipura" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Rajendra Nagar I" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Rajendra Nagar II" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Rajendra Nagar III" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Samatha nagar" },
  { city: "Bangalore", zone: "South", cluster: "Koramangala", settlement: "Shastri Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Adimoola Compound" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Anandapuram I & II" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Anjanappa Garden I & II" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Anjaneya Temple" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Bhakshi Garden I & II" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Bhangi Colony" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Cheluvadipalya" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Doraiswamy Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Flower Garden" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Giripuram" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Gurappa Garden" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Jai Bheem Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Jolly Mohalla" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "New Tharagupet" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Old Pension Mohalla" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Ramanna Garden" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Saw Mill Lane" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Sidhartha Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Tippu Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Velmurugapuram" },
  { city: "Bangalore", zone: "Central", cluster: "KR Market", settlement: "Vinoba nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Ambedkar Nagar-97" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Anjaneya block" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Dayananda Nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Gawtham Nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Gopalpura" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Handigudisalu" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Hanumanthappa Colony" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Hanumanthapura" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Himalaya Huts" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "JCW Nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Kasturi Nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Lakshmanapuri" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Minerva Mill" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Okalipuram" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Railway Station/Ambedkar Nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Rasaldhar Street" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "RKS" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Shastri Nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Srirampura" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Swathanthra Nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Valluvarpurm" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Vivekananda block" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "Vivekananda Nagar" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "VST colony" },
  { city: "Bangalore", zone: "North", cluster: "Majestic", settlement: "VV Giri colony" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Ahammed Nagar (CRC proposed)" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Ambedkar Nagar-105" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Ambedkar Quarters" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Bangarappa Gudde" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Bhuvaneshwari nagar" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Chamundi Slum" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Channasandra" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Corporation Colony" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "D'souza Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Devegowda slum" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Ganapathi Slum" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Gangondanahalli" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Hosakerehalli" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Hoysala Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Javaregoudana Doddi" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Kanaka Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Kurilingappa Garden" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Mutthurayana Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Nanjarasappa Badavane" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Patankot" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "RNS collage compound - Floating population" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Thande Periyar nagar" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Thimmenahalli" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Vasanthapura" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Veerabhadra Nagar" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Venkateshwara slum" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Vinayaka Slum" },
  { city: "Bangalore", zone: "Central", cluster: "Nagarbhavi", settlement: "Yadalamma Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Ashraya Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Buddha Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Goutham Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Gulbarga Slum" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Havadigara Colony" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Jaibhuvaneshwari Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Kaveri Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Kempamma badavane" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Lumbini Slum" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Muneshwar Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Sanjay Gandhi Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Sanjay Gandhi Nagar-42" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Siddarthanagar" },
  { city: "Bangalore", zone: "West", cluster: "Peenya - West", settlement: "Vambe Quarters" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Ambi Circle Water Tank Park" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Gulbarga Slum" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Kole Basawa Community Jopadi" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Kottigepalya" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Maruthi Nagar A" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Maruthi Nagar B" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Maruthi Nagar near Bilal Masjid" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Near Ambi circle" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Sathi circle" },
  { city: "Bangalore", zone: "North", cluster: "Peenya North", settlement: "Sumanahalli" },
  { city: "Bangalore", zone: "Central", cluster: "Rayapuram", settlement: "8th and 9th Main Road" },
  { city: "Bangalore", zone: "Central", cluster: "Rayapuram", settlement: "Harikunte" },
  { city: "Bangalore", zone: "Central", cluster: "Rayapuram", settlement: "IPD Salappa Layout" },
  { city: "Bangalore", zone: "Central", cluster: "Rayapuram", settlement: "JJR Nagar North" },
  { city: "Bangalore", zone: "Central", cluster: "Rayapuram", settlement: "JJR Nagar South" },
  { city: "Bangalore", zone: "Central", cluster: "Rayapuram", settlement: "VS Garden" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "1st Main Road By the Lake" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "6th Main Road" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "8th Main Road" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Aishwarya Oil Mill Behind" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Behind UIDAI" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Bhoopsandra" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Gas Godown" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Jalageramma Temple" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Kanuramma Temple" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Kole Basawa Community" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Muneshwara Temple Area" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Railway Cross Doddabommasandra" },
  { city: "Bangalore", zone: "North", cluster: "Sanjaynagar", settlement: "Virupakshapura" },
  { city: "Bangalore", zone: "South", cluster: "Sarjapur Road", settlement: "Dommasandhra 3 sites" },
  { city: "Bangalore", zone: "South", cluster: "Sarjapur Road", settlement: "Girish Vatara Halanayakanahalli" },
  { city: "Bangalore", zone: "South", cluster: "Sarjapur Road", settlement: "Kodathi Community" },
  { city: "Bangalore", zone: "South", cluster: "Sarjapur Road", settlement: "Rayasandhra Community" },
  { city: "Bangalore", zone: "South", cluster: "Sarjapur Road", settlement: "Yamare 2 sites" },
  { city: "Bangalore", zone: "West", cluster: "Ullalu", settlement: "Ambedkar Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Ullalu", settlement: "Atmajyothi Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Ullalu", settlement: "Hakkipikki Subhashnagar" },
  { city: "Bangalore", zone: "West", cluster: "Ullalu", settlement: "New Colony" },
  { city: "Bangalore", zone: "West", cluster: "Ullalu", settlement: "New Colony II (Venkatappa layout)" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Ambedkar Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Bheemshakthi Slum" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Jaibheemnagar" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Kodipalya Slum" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Krishnappa Garden" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Sarkari Oni" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Sharif Nagar" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Sunnadgudu" },
  { city: "Bangalore", zone: "West", cluster: "Yeshwantpur", settlement: "Vinayaka and Karimandi" },
];

async function main() {
  console.log(`Importing ${data.length} settlement records...`);

  // Track created/found IDs
  const cityMap = new Map<string, string>();
  const zoneMap = new Map<string, string>(); // key: "cityId:zoneName"
  const clusterMap = new Map<string, string>(); // key: "zoneId:clusterName"

  for (const row of data) {
    // Upsert city
    let cityId = cityMap.get(row.city);
    if (!cityId) {
      const existing = await prisma.city.findFirst({
        where: { name: row.city, deletedAt: null },
      });
      if (existing) {
        cityId = existing.id;
      } else {
        const created = await prisma.city.create({ data: { name: row.city } });
        cityId = created.id;
        console.log(`  Created city: ${row.city}`);
      }
      cityMap.set(row.city, cityId);
    }

    // Upsert zone
    const zoneKey = `${cityId}:${row.zone}`;
    let zoneId = zoneMap.get(zoneKey);
    if (!zoneId) {
      const existing = await prisma.zone.findFirst({
        where: { name: row.zone, cityId, deletedAt: null },
      });
      if (existing) {
        zoneId = existing.id;
      } else {
        const created = await prisma.zone.create({ data: { name: row.zone, cityId } });
        zoneId = created.id;
        console.log(`  Created zone: ${row.zone} (${row.city})`);
      }
      zoneMap.set(zoneKey, zoneId);
    }

    // Upsert cluster
    const clusterKey = `${zoneId}:${row.cluster}`;
    let clusterId = clusterMap.get(clusterKey);
    if (!clusterId) {
      const existing = await prisma.cluster.findFirst({
        where: { name: row.cluster, zoneId, deletedAt: null },
      });
      if (existing) {
        clusterId = existing.id;
      } else {
        const created = await prisma.cluster.create({ data: { name: row.cluster, zoneId } });
        clusterId = created.id;
        console.log(`  Created cluster: ${row.cluster} (${row.zone})`);
      }
      clusterMap.set(clusterKey, clusterId);
    }

    // Upsert settlement
    const existingSettlement = await prisma.settlement.findFirst({
      where: { name: row.settlement, clusterId, deletedAt: null },
    });
    if (!existingSettlement) {
      await prisma.settlement.create({ data: { name: row.settlement, clusterId } });
    }
  }

  console.log(`\nDone!`);
  console.log(`Cities: ${cityMap.size}`);
  console.log(`Zones: ${zoneMap.size}`);
  console.log(`Clusters: ${clusterMap.size}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
