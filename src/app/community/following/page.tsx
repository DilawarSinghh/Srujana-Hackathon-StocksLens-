import { redirect } from "next/navigation";

export default function FollowingRedirect() {
  redirect("/community?tab=following");
}
