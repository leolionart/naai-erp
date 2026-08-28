import { redirect } from "next/navigation";

export default function NewRevenuePage() {
  redirect("/revenue?create=1");
}
