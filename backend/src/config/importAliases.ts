/**
 * Alias dictionaries mapping database field names to common column header variations.
 * All alias values are lowercase for case-insensitive matching.
 */

export type EntityType = 'vehicle' | 'driver' | 'fleet' | 'tag';

export type AliasMap = Record<string, string[]>;

export const VEHICLE_ALIASES: AliasMap = {
  registrationNumber: [
    'registration', 'registration number', 'reg number', 'reg no', 'reg', 'licence plate',
    'license plate', 'number plate', 'plate number', 'plate', 'vehicle reg', 'vehicle registration',
    'rego', 'numberplate',
  ],
  vinNumber: [
    'vin', 'vin number', 'vehicle identification number', 'chassis number', 'chassis', 'serial number',
    'vin no', 'vehicle vin', 'vinnumber',
  ],
  make: [
    'make', 'manufacturer', 'brand', 'vehicle make', 'car make', 'vehicle brand',
  ],
  model: [
    'model', 'vehicle model', 'car model', 'model name', 'model type',
  ],
  year: [
    'year', 'model year', 'manufacture year', 'year of manufacture', 'yr', 'vehicle year',
    'year manufactured',
  ],
  colour: [
    'colour', 'color', 'vehicle colour', 'vehicle color', 'car colour', 'car color', 'body colour',
    'body color',
  ],
  fuelType: [
    'fuel type', 'fuel', 'fuel kind', 'propulsion', 'energy type', 'fuel category', 'petrol or diesel',
    'fuel_type',
  ],
  tankCapacity: [
    'tank capacity', 'fuel capacity', 'tank size', 'tank volume', 'fuel tank', 'tank litres',
    'tank liters', 'capacity (l)', 'tank cap',
  ],
  currentOdometer: [
    'odometer', 'mileage', 'current odometer', 'odometer reading', 'km', 'kilometres', 'kilometers',
    'current km', 'odometer (km)', 'currentodometer',
  ],
  status: [
    'status', 'vehicle status', 'current status', 'state', 'active status',
  ],
  fleetId: [
    'fleet', 'fleet id', 'fleet name', 'fleet group', 'fleet code', 'assigned fleet', 'fleet assignment',
  ],
};

export const DRIVER_ALIASES: AliasMap = {
  firstName: [
    'first name', 'firstname', 'given name', 'forename', 'name', 'first', 'f name',
  ],
  lastName: [
    'last name', 'lastname', 'surname', 'family name', 'second name', 'last', 'l name',
  ],
  saIdNumber: [
    'id number', 'id no', 'id', 'identity number', 'sa id', 'south african id', 'national id',
    'id_number', 'rsa id', 'id card number', 'id num', 'saidnumber', 'sa id number',
  ],
  mobileNumber: [
    'mobile', 'mobile number', 'cell', 'cell number', 'cellphone', 'phone', 'phone number',
    'contact number', 'telephone', 'mobile phone', 'contact phone', 'mobilenumber',
  ],
  email: [
    'email', 'email address', 'e-mail', 'e mail', 'mail', 'email id', 'email addr',
  ],
  licenceNumber: [
    'licence number', 'license number', 'licence no', 'license no', 'driving licence', 'dl number',
    'licence #', 'driver license', 'drivers licence',
  ],
  licenceCode: [
    'licence code', 'license code', 'code', 'licence class', 'driving code', 'licence type',
    'dl code', 'licence category',
  ],
  licenceExpiry: [
    'licence expiry', 'license expiry', 'licence expiry date', 'license expiry date',
    'licence expires', 'dl expiry', 'driving licence expiry', 'licence renewal date',
  ],
  prdpExpiry: [
    'prdp expiry', 'prdp', 'prdp date', 'professional driving permit', 'pdp expiry',
    'prdp expiry date', 'professional driver permit', 'prdp expires',
  ],
  passportNumber: [
    'passport', 'passport number', 'passport no', 'travel document', 'passport num',
  ],
  prdpNumber: [
    'prdp number', 'prdp no', 'professional driving permit number', 'pdp number', 'permit number',
  ],
  fleetId: [
    'fleet', 'fleet id', 'fleet name', 'assigned fleet', 'fleet group', 'fleet code',
  ],
  status: [
    'status', 'driver status', 'active status', 'employment status', 'current status',
  ],
  dailySpendLimit: [
    'daily spend limit', 'daily limit', 'spend limit', 'daily spending limit', 'max daily spend',
    'daily cap', 'per day limit',
  ],
  monthlySpendLimit: [
    'monthly spend limit', 'monthly limit', 'monthly spending limit', 'max monthly spend',
    'monthly cap', 'per month limit',
  ],
};

export const FLEET_ALIASES: AliasMap = {
  name: [
    'name', 'fleet name', 'group name', 'fleet group', 'fleet', 'fleet title', 'fleet label',
  ],
  code: [
    'code', 'fleet code', 'group code', 'fleet id code', 'identifier', 'fleet identifier', 'code name',
  ],
  description: [
    'description', 'fleet description', 'notes', 'comments', 'info', 'details', 'remarks',
  ],
  region: [
    'region', 'area', 'zone', 'district', 'province', 'location', 'operating area', 'fleet region',
  ],
  status: [
    'status', 'fleet status', 'active status', 'current status', 'state',
  ],
};

export const TAG_ALIASES: AliasMap = {
  tagNumber: [
    'tag number', 'tag no', 'tag', 'tag id', 'fuel tag', 'tag code',
    'card number', 'card no', 'fuel card', 'transponder',
  ],
  vehicleRegistration: [
    'vehicle', 'vehicle registration', 'registration', 'reg number', 'reg no',
    'vehicle reg', 'plate', 'number plate',
  ],
  status: [
    'status', 'tag status', 'state', 'active',
  ],
  issuedDate: [
    'issued date', 'issue date', 'issued', 'date issued', 'start date', 'activation date',
  ],
  expiryDate: [
    'expiry date', 'expiry', 'expires', 'expiration', 'expiration date', 'valid until', 'end date',
  ],
};

export function getAliasMap(entityType: EntityType): AliasMap {
  switch (entityType) {
    case 'vehicle': return VEHICLE_ALIASES;
    case 'driver': return DRIVER_ALIASES;
    case 'fleet': return FLEET_ALIASES;
    case 'tag': return TAG_ALIASES;
  }
}
