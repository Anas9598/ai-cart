export class MeasureUnits {
    public static readonly kilogram = 'kg';
    public static readonly dozen = 'dz';    
    public static readonly gram = 'gm';
    public static readonly piece = 'pc';
    public static readonly litre = 'lt';
    public static readonly millilitre = 'ml';
}

export interface IProduct {    
    id: number | string;
    name: string;
    primaryUnit: MeasureUnits;
    maxAllowedQuantity: number;
    minAllowedQuantity: number;
    quantitySteps: number;
}

export interface ISelectedProduct {    
    id: number | string;
    name: string;
    quantity: number;
    unit?: string;
}