import { MissionControl } from "@/components/kira/mission-control";
export default function Page() {
  return (
    <MissionControl
      dateKey={new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Phoenix",
      })}
    />
  );
}
