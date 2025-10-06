import type { StoreInfo } from './types';
import StorefrontPassword from './settings/StorefrontPassword';

interface SettingsProps {
  storeInfo: StoreInfo;
}

export default function Settings({ storeInfo }: SettingsProps) {
  return (
    <div className="flex flex-col">
      <StorefrontPassword storeInfo={storeInfo} />
    </div>
  );
}
