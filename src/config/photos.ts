import type { StaticImageData } from "next/image";
import blueHour from "@/assets/photos/blue-hour.jpg";
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
} as const;

/** Shown on the gallery page, in this order. */
export const GALLERY: readonly Photo[] = [
  PHOTOS.terraceSunset,
  PHOTOS.heroWide,
  PHOTOS.fortressDay,
  PHOTOS.terraceShip,
  photo(duskLights, "The Old Town at dusk as the first lights come on", "Η Παλιά Πόλη το σούρουπο, την ώρα που ανάβουν τα πρώτα φώτα"),
  PHOTOS.fortressNight,
  photo(sunsetSun, "The sun touching the horizon under dark clouds", "Ο ήλιος αγγίζει τον ορίζοντα κάτω από σκούρα σύννεφα"),
  photo(fortressPark, "The Old Fortress beyond the park of the Spianada on a clear day", "Το Παλαιό Φρούριο πίσω από το πάρκο της Σπιανάδας μια καθαρή μέρα"),
  PHOTOS.terraceRainbow,
  photo(goldenRooftops, "Golden evening light on the rooftops of the Old Town", "Χρυσό απογευματινό φως στις στέγες της Παλιάς Πόλης"),
  photo(palaceView, "The Palace of St Michael and St George with the sea and mountains behind", "Το Παλάτι των Αγίων Μιχαήλ και Γεωργίου με φόντο τη θάλασσα και τα βουνά"),
  PHOTOS.heroTall,
  photo(duskPink, "Pink clouds over the Old Town after sunset", "Ροζ σύννεφα πάνω από την Παλιά Πόλη μετά το ηλιοβασίλεμα"),
  photo(sunRays, "Rays of sunlight breaking through clouds over the town", "Ακτίνες ήλιου ανάμεσα στα σύννεφα πάνω από την πόλη"),
  photo(blueHour, "The Old Town in the blue hour with windows lit", "Η Παλιά Πόλη τη μπλε ώρα με φωτισμένα παράθυρα"),
  photo(duskClouds, "Heavy clouds over the Old Town with an orange horizon", "Βαριά σύννεφα πάνω από την Παλιά Πόλη με πορτοκαλί ορίζοντα"),
];
