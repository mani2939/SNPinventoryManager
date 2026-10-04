import {requireWorkspace} from '@/lib/auth';
export default async function Layout({children}:{children:React.ReactNode}){await requireWorkspace('inventory');return children;}
