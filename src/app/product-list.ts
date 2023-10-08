import { IProduct, MeasureUnits } from "./app-model";

export const products: IProduct[] = [
    {
        id: 101,
        name: 'Potato',
        primaryUnit: MeasureUnits.kilogram,
        maxAllowedQuantity: 5,
        minAllowedQuantity: 0.5,
        quantitySteps: 0.25,
    },
    {
        id: 102,
        name: 'Banana',
        primaryUnit: MeasureUnits.dozen,
        maxAllowedQuantity: 5,
        minAllowedQuantity: 1,
        quantitySteps: 0.5
    },
    {
        id: 1,
        name: 'Mango',
        primaryUnit: MeasureUnits.gram,
        maxAllowedQuantity: 500,
        minAllowedQuantity: 100,
        quantitySteps: 50
    },
    {
        id: 1,
        name: 'Pineapple',
        primaryUnit: MeasureUnits.piece,
        maxAllowedQuantity: 3,
        minAllowedQuantity: 1,
        quantitySteps: 1
    },
    {
        id: 1,
        name: 'Milk',
        primaryUnit: MeasureUnits.litre,
        maxAllowedQuantity: 4,
        minAllowedQuantity: 0.5,
        quantitySteps: 0.5
    },
    {
        id: 1,
        name: 'Orange juice',
        primaryUnit: MeasureUnits.millilitre,
        maxAllowedQuantity: 2000,
        minAllowedQuantity: 200,
        quantitySteps: 100
    }
];