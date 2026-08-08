export interface Resource {
  title: string;
  url: string;
}

export interface Developer {
  website: string | null;
  address: string | null;
}

export interface AppRaw {
  resources: Resource[];
  developer: Developer;
  launchDate: string | null;
  age: string | null;
  detailedAge: string | null;
}

export type App = {
  name: string;
  handle: string;
  iconUrl: string;
  link: string;
  iconFigure: HTMLElement | null;
  rating: string;
  reviewCount: number;
  pricing: string;
  description: string;
  isInstalled: boolean;
  isBuiltForShopify: boolean;
} & AppRaw;
