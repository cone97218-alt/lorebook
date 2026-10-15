import type { Component } from 'vue';
import Lorebook from './lorebook/index.vue';
import Settings from './settings/index.vue';

export interface PageDef {
  id: string;
  icon: string;
  component: Component;
}

export const PAGES: PageDef[] = [
  { id: 'lorebook', icon: 'fa-solid fa-book-bookmark', component: Lorebook },
  { id: 'settings', icon: 'fa-solid fa-sliders', component: Settings },
];

export function getPage(id: string): PageDef {
  return PAGES.find(p => p.id === id) ?? PAGES[0];
}
