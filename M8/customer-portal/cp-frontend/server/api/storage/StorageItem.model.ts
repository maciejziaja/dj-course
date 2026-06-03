import mongoose, { Schema } from 'mongoose';

export interface IStorageItem {
  id: string;
  cargoType: string;
  quantity: number;
  unitType: string;
  storageLocation: string;
  status: string;
  arrivalDate: Date;
  departureDate?: Date;
}

const schema = new Schema<IStorageItem>({
  id: { type: String, required: true, unique: true },
  cargoType: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitType: { type: String, required: true },
  storageLocation: { type: String, required: true },
  status: { type: String, required: true },
  arrivalDate: { type: Date, required: true },
  departureDate: Date,
}, { timestamps: true, id: false });

export const StorageItem: mongoose.Model<IStorageItem> =
  mongoose.models.StorageItem ||
  mongoose.model<IStorageItem>('StorageItem', schema, 'storage_items');
