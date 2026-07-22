import { HangarBay } from '../src/world/HangarBay.js';
import { createPlayerStarter } from '../src/ships/ShipGenerator.js';

function smoke(label, fn) {
  try {
    fn();
    console.log('OK', label);
  } catch (e) {
    console.error('FAIL', label, e.message);
    process.exitCode = 1;
  }
}

smoke('menu hangar entry', () => {
  const bay = new HangarBay();
  const ship = createPlayerStarter();
  bay.reset(ship, { playerBayIndex: 1, placeId: 'place.jennings' });
  bay.warmStartHeadless();
  for (let i = 0; i < 30; i++) bay.update(1 / 60, ship, {});
});

smoke('quick launch hangar lod', () => {
  const bay = new HangarBay();
  const ship = createPlayerStarter();
  bay.reset(ship, { playerBayIndex: 1, placeId: 'place.jennings' });
  bay.warmStartHeadless();
  bay.clearControlledPadAfterLaunch();
  bay.preferExternalDoorTraffic = true;
  for (let i = 0; i < 60; i++) bay.update(1 / 60, null, {});
});

if (!process.exitCode) console.log('all smoke tests passed');
