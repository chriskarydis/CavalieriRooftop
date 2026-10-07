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
   * Car parks near the hotel. The first two are from OpenStreetMap (October 2026), unchecked on the
   * spot; the third was chosen by the owner.
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
      // Chosen by the owner, by its Google Maps place.
      name: { en: "Car park", el: "Πάρκινγκ" },
      note: { en: "Opens in Google Maps.", el: "Ανοίγει στο Google Maps." },
      directionsUrl: "https://www.google.com/maps?ftid=0x135b5d0051217adf:0xd2bb53b1cc27f7be",
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
