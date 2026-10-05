import { notFound } from "next/navigation";

/** Any unknown address under a language shows that language's "page not found". */
export default function UnknownPage() {
  notFound();
}
