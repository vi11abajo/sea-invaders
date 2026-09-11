import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';

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
