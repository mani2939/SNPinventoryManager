import {requireWorkspace} from '@/lib/auth';
export default async function Layout({children}:{children:React.ReactNode}){await requireWorkspace('invoicing');return children;}
