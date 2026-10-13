// Semantic icon name -> MaterialCommunityIcons glyph (docs/design/review-round1.md icon table).
// Pure module so a Jest test can check every glyph exists in the font's glyph map.

export const ICON_GLYPHS = {
  moving: 'play',
  stopped: 'pause',
  offline: 'signal-off',
  sos: 'alert',
  warning: 'alert',
  leader: 'star',
  ready: 'check',
  connecting: 'dots-horizontal-circle-outline',
  notSharing: 'map-marker-off',
  bgOff: 'cellphone-lock',
  notifOff: 'bell-off',
  permLocation: 'map-marker',
  permBackground: 'map-marker-radius',
  permNotifications: 'bell-ring',
  endRide: 'flag-checkered',
  leave: 'exit-run',
  inviteOutline: 'account-plus-outline',
  shareOutline: 'share-variant-outline',
  message: 'message-text',
  list: 'format-list-bulleted',
  map: 'map',
  fit: 'fit-to-screen',
  share: 'share-variant',
  back: 'chevron-left',
  menu: 'dots-horizontal',
  close: 'close',
  edit: 'pencil',
  navigate: 'navigation-variant',
  bike: 'motorbike',
  call: 'phone',
  connected: 'circle',
  away: 'circle-outline',
  // --- sos contacts ---
  shield: 'shield-account',
  group: 'account-group',
  lock: 'lock',
  phonePlus: 'phone-plus',
  contacts: 'contacts',
  ambulance: 'ambulance',
  more: 'dots-vertical',
  // --- end sos contacts ---
  // --- invite / account / recent rides ---
  chevronRight: 'chevron-right',
  invite: 'account-plus',
  invited: 'clock-outline',
  riders: 'account-multiple',
  history: 'history',
  cloudSave: 'cloud-upload-outline',
  cloudSaved: 'cloud-check',
  email: 'email-outline',
  cellphone: 'cellphone',
  signOut: 'logout',
  // --- end invite / account / recent rides ---
  // --- ux overhaul (13 §0.4) ---
  smsText: 'message-processing',
  link: 'link-variant',
  distance: 'map-marker-distance',
  duration: 'timer-outline',
  palette: 'theme-light-dark',
  delete: 'delete-outline',
  arrowUp: 'arrow-up',
  arrowDown: 'arrow-down',
  dialpad: 'dialpad',
  vibrate: 'vibrate',
  person: 'account',
  // --- end ux overhaul ---
  // --- signature pass (16) ---
  equal: 'equal',
  listView: 'view-agenda-outline',
  centerMe: 'navigation-variant-outline',
  fitPage: 'fit-to-page-outline',
  chevronUp: 'chevron-up',
  chevronDown: 'chevron-down',
  startPin: 'circle-double',
  checkCircle: 'check-circle',
  arrowRight: 'arrow-right',
  arrowLeft: 'arrow-left',
  flag: 'flag-variant',
  // --- end signature pass ---
  // --- full map (19 B) ---
  expand: 'fullscreen',
  collapse: 'fullscreen-exit',
  // --- end full map ---
  // --- next stop (19 A) ---
  search: 'magnify',
  coffee: 'coffee',
  // --- end next stop ---
} as const;

export type IconName = keyof typeof ICON_GLYPHS;
