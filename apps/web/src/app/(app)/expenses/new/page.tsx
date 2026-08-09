import { redirect } from "next/navigation";

export default function Page() {
  redirect("/expenses?create=1");
}
