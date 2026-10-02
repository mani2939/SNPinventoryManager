import bwipjs from "bwip-js/node";
import { skuSchema } from "./validation";
export function generateBarcode(sku: string) {
  const text = skuSchema.parse(sku);
  return bwipjs.toSVG({
    bcid: "code128",
    text,
    height: 12,
    scale: 2,
    paddingwidth: 10,
    paddingheight: 2,
    includetext: false,
    barcolor: "000000",
    backgroundcolor: "FFFFFF",
  });
}
