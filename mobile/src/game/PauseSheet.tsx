import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';

/**
 * Shown over a run just revived by the Tide: the run stays stopped until the player is ready (a
 * revive that resumed the moment the chain confirmed it gave no time to get set).
 */
export function RevivedSheet({ lives, onResume }: { lives: number; onResume: () => void }) {
  return (
    <Sheet kind="modal">
      <Txt variant="headline">Revived</Txt>
      <Txt variant="body" tone="secondary">{`${lives} lives back. Carry on when you are ready.`}</Txt>
      <PillButton label="Resume" onPress={onResume} />
    </Sheet>
  );
}

/** Shown while the run is paused; "Quit run" ends it and opens the result. */
export function PauseSheet({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <Sheet kind="modal">
      <Txt variant="headline">Paused</Txt>
      <PillButton label="Resume" onPress={onResume} />
      <PillButton label="Quit run" kind="secondary" onPress={onQuit} />
    </Sheet>
  );
}
