import type { StaticImageData } from "next/image";
import blueHour from "@/assets/photos/blue-hour.jpg";
import fortressTableShip from "@/assets/photos/fortress-table-ship.jpg";
import terraceFortress from "@/assets/photos/terrace-fortress.jpg";
import terracePanorama from "@/assets/photos/terrace-panorama.jpg";
import terraceEntrance from "@/assets/photos/terrace-entrance.jpg";
import terraceFortressWide from "@/assets/photos/terrace-fortress-wide.jpg";
import terraceTables from "@/assets/photos/terrace-tables.jpg";
import fortressTablesRail from "@/assets/photos/fortress-tables-rail.jpg";
import fortressTableTall from "@/assets/photos/fortress-table-tall.jpg";
import oldTownTables from "@/assets/photos/old-town-tables.jpg";
import oldTownRoofs from "@/assets/photos/old-town-roofs.jpg";
import fortressTrees from "@/assets/photos/fortress-trees.jpg";
import shipTable from "@/assets/photos/ship-table.jpg";
import garitsaTables from "@/assets/photos/garitsa-tables.jpg";
import terraceLong from "@/assets/photos/terrace-long.jpg";
import fortressClose from "@/assets/photos/fortress-close.jpg";
import fortressTableWide from "@/assets/photos/fortress-table-wide.jpg";
import duskClouds from "@/assets/photos/dusk-clouds.jpg";
import duskLights from "@/assets/photos/dusk-lights.jpg";
import duskPink from "@/assets/photos/dusk-pink.jpg";
import fortressDay from "@/assets/photos/fortress-day.jpg";
import fortressNight from "@/assets/photos/fortress-night.jpg";
import fortressPark from "@/assets/photos/fortress-park.jpg";
import goldenRooftops from "@/assets/photos/golden-rooftops.jpg";
import palaceView from "@/assets/photos/palace-view.jpg";
import pastaView from "@/assets/photos/pasta-view.jpg";
import sunRays from "@/assets/photos/sun-rays.jpg";
import sunsetRooftopsTall from "@/assets/photos/sunset-rooftops-tall.jpg";
import sunsetRooftopsWide from "@/assets/photos/sunset-rooftops-wide.jpg";
import sunsetSun from "@/assets/photos/sunset-sun.jpg";
import terraceRainbow from "@/assets/photos/terrace-rainbow.jpg";
import terraceShip from "@/assets/photos/terrace-ship.jpg";
import terraceSunset from "@/assets/photos/terrace-sunset.jpg";

/**
 * The restaurant's own photographs. Originals are kept by the owner; the
 * web-sized copies here are produced by scripts/prepare-photos.mjs.
 */

export interface Photo {
  image: StaticImageData;
  /** What the photo shows, for people who cannot see it. */
  alt: { en: string; el: string };
}

const photo = (image: StaticImageData, en: string, el: string): Photo => ({ image, alt: { en, el } });

export const PHOTOS = {
  heroWide: photo(
    sunsetRooftopsWide,
    "The sun setting behind the rooftops of Corfu Old Town, seen from the roof garden",
    "Ο ήλιος δύει πίσω από τις στέγες της Παλιάς Πόλης της Κέρκυρας, όπως φαίνεται από την ταράτσα",
  ),
  heroTall: photo(
    sunsetRooftopsTall,
    "Sunset over the rooftops of Corfu Old Town, seen from the roof garden",
    "Ηλιοβασίλεμα πάνω από τις στέγες της Παλιάς Πόλης της Κέρκυρας, όπως φαίνεται από την ταράτσα",
  ),
  terraceSunset: photo(
    terraceSunset,
    "Tables laid with white cloths on the terrace under a pink sunset sky",
    "Τραπέζια με λευκά τραπεζομάντιλα στην ταράτσα κάτω από ροζ ουρανό στο ηλιοβασίλεμα",
  ),
  fortressDay: photo(
    fortressDay,
    "The Old Fortress and the sea beyond the trees of the Spianada, seen from the roof garden",
    "Το Παλαιό Φρούριο και η θάλασσα πίσω από τα δέντρα της Σπιανάδας, όπως φαίνονται από την ταράτσα",
  ),
  fortressNight: photo(
    fortressNight,
    "The Old Fortress lit up at night above the bay",
    "Το Παλαιό Φρούριο φωτισμένο τη νύχτα πάνω από τον κόλπο",
  ),
  pasta: photo(
    pastaView,
    "A plate of fresh pasta on the terrace wall with the Old Town behind it",
    "Ένα πιάτο φρέσκα ζυμαρικά στο πεζούλι της ταράτσας με φόντο την Παλιά Πόλη",
  ),
  terraceShip: photo(
    terraceShip,
    "A laid table on the terrace with a cruise ship passing in the channel",
    "Στρωμένο τραπέζι στην ταράτσα με ένα κρουαζιερόπλοιο να περνά στο κανάλι",
  ),
  terraceRainbow: photo(
    terraceRainbow,
    "A rainbow over sailing boats in the bay, seen from the terrace",
    "Ουράνιο τόξο πάνω από ιστιοφόρα στον κόλπο, όπως φαίνεται από την ταράτσα",
  ),
  fortressTableShip: photo(
    fortressTableShip,
    "A laid table at the parapet with the Old Fortress and a cruise ship in the channel",
    "Στρωμένο τραπέζι στο στηθαίο με το Παλαιό Φρούριο και ένα κρουαζιερόπλοιο στο κανάλι",
  ),
  terraceFortress: photo(
    terraceFortress,
    "The terrace laid for dinner with the Old Fortress and the sea behind",
    "Η ταράτσα στρωμένη για δείπνο με φόντο το Παλαιό Φρούριο και τη θάλασσα",
  ),
  terracePanorama: photo(
    terracePanorama,
    "The whole terrace in one view, from the Old Town to the Old Fortress and the sea",
    "Όλη η ταράτσα σε μία εικόνα, από την Παλιά Πόλη ως το Παλαιό Φρούριο και τη θάλασσα",
  ),
  terraceEntrance: photo(
    terraceEntrance,
    "The way onto the terrace, under the wooden roof, with olive trees in pots",
    "Η είσοδος στην ταράτσα κάτω από το ξύλινο στέγαστρο, με ελιές σε γλάστρες",
  ),
  terraceFortressWide: photo(
    terraceFortressWide,
    "Tables across the terrace with the Old Fortress in the middle distance",
    "Τραπέζια σε όλη την ταράτσα με το Παλαιό Φρούριο στο βάθος",
  ),
  terraceTables: photo(
    terraceTables,
    "White tablecloths and lamps on the terrace with the sea beyond",
    "Λευκά τραπεζομάντιλα και φανάρια στην ταράτσα με φόντο τη θάλασσα",
  ),
  fortressTablesRail: photo(
    fortressTablesRail,
    "Tables along the white balustrade facing the Old Fortress",
    "Τραπέζια κατά μήκος του λευκού κιγκλιδώματος με θέα το Παλαιό Φρούριο",
  ),
  fortressTableTall: photo(
    fortressTableTall,
    "A table for four at the balustrade above the trees, with the Old Fortress beyond",
    "Τραπέζι για τέσσερις στο κιγκλίδωμα πάνω από τα δέντρα, με φόντο το Παλαιό Φρούριο",
  ),
  oldTownTables: photo(
    oldTownTables,
    "Tables at the edge of the terrace looking over the rooftops of the Old Town",
    "Τραπέζια στην άκρη της ταράτσας με θέα τις στέγες της Παλιάς Πόλης",
  ),
  oldTownRoofs: photo(
    oldTownRoofs,
    "The rooftops of the Old Town and the mountains across the water",
    "Οι στέγες της Παλιάς Πόλης και τα βουνά απέναντι",
  ),
  fortressTrees: photo(
    fortressTrees,
    "The Old Fortress above the trees of the Spianada, with a sailing boat on the sea",
    "Το Παλαιό Φρούριο πάνω από τα δέντρα της Σπιανάδας, με ένα ιστιοφόρο στη θάλασσα",
  ),
  shipTable: photo(
    shipTable,
    "A cruise ship passing below a table laid at the balustrade",
    "Κρουαζιερόπλοιο περνά κάτω από ένα στρωμένο τραπέζι στο κιγκλίδωμα",
  ),
  garitsaTables: photo(
    garitsaTables,
    "Tables on the side of the terrace that looks over Garitsa bay",
    "Τραπέζια στην πλευρά της ταράτσας που βλέπει τον κόλπο της Γαρίτσας",
  ),
  terraceLong: photo(
    terraceLong,
    "The length of the terrace, tables in a row beside the sea view",
    "Η ταράτσα σε όλο της το μήκος, με τα τραπέζια στη σειρά δίπλα στη θέα",
  ),
  fortressClose: photo(
    fortressClose,
    "The Old Fortress seen from a corner table",
    "Το Παλαιό Φρούριο από ένα γωνιακό τραπέζι",
  ),
  fortressTableWide: photo(
    fortressTableWide,
    "A table laid at the parapet with the Old Fortress and the channel behind",
    "Στρωμένο τραπέζι στο στηθαίο με φόντο το Παλαιό Φρούριο και το κανάλι",
  ),
} as const;

/** Shown on the gallery page, in this order. */
export const GALLERY: readonly Photo[] = [
  PHOTOS.terraceFortressWide,
  PHOTOS.fortressTableShip,
  PHOTOS.terraceSunset,
  PHOTOS.terraceTables,
  PHOTOS.heroWide,
  PHOTOS.oldTownTables,
  PHOTOS.fortressDay,
  PHOTOS.fortressTablesRail,
  PHOTOS.terraceShip,
  PHOTOS.fortressTableTall,
  photo(duskLights, "The Old Town at dusk as the first lights come on", "Η Παλιά Πόλη το σούρουπο, την ώρα που ανάβουν τα πρώτα φώτα"),
  PHOTOS.terraceFortress,
  PHOTOS.fortressNight,
  PHOTOS.oldTownRoofs,
  photo(sunsetSun, "The sun touching the horizon under dark clouds", "Ο ήλιος αγγίζει τον ορίζοντα κάτω από σκούρα σύννεφα"),
  PHOTOS.fortressTrees,
  photo(fortressPark, "The Old Fortress beyond the park of the Spianada on a clear day", "Το Παλαιό Φρούριο πίσω από το πάρκο της Σπιανάδας μια καθαρή μέρα"),
  PHOTOS.shipTable,
  PHOTOS.terraceRainbow,
  PHOTOS.garitsaTables,
  photo(goldenRooftops, "Golden evening light on the rooftops of the Old Town", "Χρυσό απογευματινό φως στις στέγες της Παλιάς Πόλης"),
  PHOTOS.terraceLong,
  photo(palaceView, "The Palace of St Michael and St George with the sea and mountains behind", "Το Παλάτι των Αγίων Μιχαήλ και Γεωργίου με φόντο τη θάλασσα και τα βουνά"),
  PHOTOS.fortressClose,
  PHOTOS.heroTall,
  PHOTOS.fortressTableWide,
  photo(duskPink, "Pink clouds over the Old Town after sunset", "Ροζ σύννεφα πάνω από την Παλιά Πόλη μετά το ηλιοβασίλεμα"),
  PHOTOS.terraceEntrance,
  photo(sunRays, "Rays of sunlight breaking through clouds over the town", "Ακτίνες ήλιου ανάμεσα στα σύννεφα πάνω από την πόλη"),
  photo(blueHour, "The Old Town in the blue hour with windows lit", "Η Παλιά Πόλη τη μπλε ώρα με φωτισμένα παράθυρα"),
  photo(duskClouds, "Heavy clouds over the Old Town with an orange horizon", "Βαριά σύννεφα πάνω από την Παλιά Πόλη με πορτοκαλί ορίζοντα"),
];
