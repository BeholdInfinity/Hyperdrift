/**
 * Installable hangar / bay facility modules.
 */

export const HANGAR_MODULES = {
  serviceBoard: {
    id: 'serviceBoard',
    scope: 'bay',
    label: 'Service board',
  },
  scanner: {
    id: 'scanner',
    scope: 'bay',
    label: 'Corner scanners',
  },
  elevator: {
    id: 'elevator',
    scope: 'bay',
    label: 'Elevator',
  },
  door: {
    id: 'door',
    scope: 'bay',
    label: 'Bay door',
  },
  crane: {
    id: 'crane',
    scope: 'shared',
    label: 'Gantry crane',
  },
  forkliftHub: {
    id: 'forkliftHub',
    scope: 'shared',
    label: 'Forklift hub',
  },
  securityPost: {
    id: 'securityPost',
    scope: 'shared',
    label: 'Security post',
  },
};

export const BAY_MODULE_IDS = ['serviceBoard', 'scanner', 'elevator', 'door'];
export const SHARED_MODULE_IDS = ['crane', 'forkliftHub', 'securityPost'];

/** Full Jennings commercial bay kit */
export const JENNINGS_BAY_MODULES = [
  'elevator',
  'scanner',
  'serviceBoard',
  'door',
];

export const JENNINGS_SHARED_MODULES = ['crane', 'forkliftHub'];

export function hasModule(list, id) {
  return Array.isArray(list) && list.includes(id);
}

export function normalizeModuleList(list, allowed) {
  const set = new Set();
  for (const id of list || []) {
    if (allowed.includes(id)) set.add(id);
  }
  return [...set];
}
