export interface Resource {
  title: string;
  url: string;
}

export interface Developer {
  website: string | null;
  address: string | null;
}

export type AppRaw = {
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
} & AppRaw

export type SummaryCardProps = {
  app: App;
  className?: string;
};

export type SortableHeaderProps = {
  label: string;
  column: keyof App;
  align?: 'left' | 'center' | 'right';
  sortState: {
    column: keyof App | null;
    direction: 'asc' | 'desc' | null;
  };
  onSort: (column: keyof App, direction: 'asc' | 'desc') => void;
};
