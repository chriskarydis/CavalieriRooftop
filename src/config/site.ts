/**
 * Public facts about the restaurant, taken from its current website. Edit
 * here until a "restaurant details" settings screen exists.
 */
export const SITE = {
  name: "Cavalieri Roof Garden",
  legalName: "ΤΟΥΡΙΣΤΙΚΑΙ ΕΠΙΧΕΙΡΗΣΕΙΣ ΚΑΒΑΛΙΕΡΙ ΜΟΝΟΠΡΟΣΩΠΗ Ε.Π.Ε.",
  vatNumber: "EL095028031",
  street: "Kapodistriou 4",
  postalCode: "49100",
  city: { en: "Corfu Town", el: "Κέρκυρα" },
  country: "GR",
  phone: "+30 26610 39041",
  phoneHref: "tel:+302661039041",
  email: "info@cavalieriroofgarden.com",
  /** Service hours on open days. Reservation times are configured separately. */
  opens: "18:30",
  closes: "00:00",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=Cavalieri+Roof+Garden+Kapodistriou+4+Corfu",
  /** The same place as a map that can be shown inside a page, and as a destination for directions. */
  mapEmbedUrl: "https://www.google.com/maps?q=Cavalieri+Hotel+Kapodistriou+4+Corfu&z=16&output=embed",
  directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=Cavalieri+Hotel+Kapodistriou+4+Corfu",
  parkingSearchUrl: "https://www.google.com/maps/search/parking+near+Cavalieri+Hotel+Kapodistriou+4+Corfu",
  /**
   * The three public car parks nearest the hotel, nearest first. Positions and details are from
   * OpenStreetMap (October 2026) and have not been checked on the spot.
   */
  parking: [
    {
      name: { en: "Spianada car park", el: "Πάρκινγκ Σπιανάδας" },
      note: { en: "Open-air, with a fee. About 450 m.", el: "Υπαίθριο, με χρέωση. Περίπου 450 μ." },
      directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=39.6243733,19.9247055",
    },
    {
      name: { en: "Underground car park, town centre", el: "Υπόγειο πάρκινγκ, κέντρο πόλης" },
      note: { en: "Underground. About 750 m.", el: "Υπόγειο. Περίπου 750 μ." },
      directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=39.6220769,19.9158872",
    },
    {
      name: { en: "Underground car park, towards Garitsa", el: "Υπόγειο πάρκινγκ, προς Γαρίτσα" },
      note: { en: "Underground. About 800 m.", el: "Υπόγειο. Περίπου 800 μ." },
      directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=39.61724,19.9158327",
    },
  ],
  social: {
    instagram: "https://www.instagram.com/cavalieriroofgarden/",
    facebook: "https://www.facebook.com/p/Cavalieri-Roof-Garden-100063548092513/",
    tripadvisor:
      "https://www.tripadvisor.com/Restaurant_Review-g189458-d4363305-Reviews-Cavalieri_Roof_Garden-Corfu_Ionian_Islands.html",
  },
} as const;

/** Canonical address of the public site, used for metadata, the sitemap and structured data. */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
