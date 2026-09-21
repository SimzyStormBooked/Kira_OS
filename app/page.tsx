import { MissionControl } from "@/components/kira/mission-control";

/** The workspace runs on the author's own clock, not the server's. */
function greetingFor(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Phoenix",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Page() {
  const now = new Date();
  return (
    <MissionControl
      greeting={greetingFor(now)}
      dateKey={now.toLocaleDateString("en-CA", {
        timeZone: "America/Phoenix",
      })}
    />
  );
}
