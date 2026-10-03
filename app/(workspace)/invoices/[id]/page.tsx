import { InvoiceDetails } from '@/components/invoice-details';
export default async function Page({params}:{params:Promise<{id:string}>}){return <InvoiceDetails id={(await params).id}/>;}
