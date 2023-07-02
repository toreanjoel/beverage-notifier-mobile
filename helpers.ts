import {Peripheral} from 'react-native-ble-manager';
import {BLE_SUPPORTED_NAME} from './constants';
// import {SERVICE, CHARACTERISTIC} from './types';

/**
 * Get the service and characteristic uuids
 * Here we pull out the characteristing and service from the recieved data from the connected peripheral.
 * The data returns the properties as a list and we need to get the correct uuid values that match regex 128bit uuid
 * @param peripheralRetrievedInfo
 */

export function getServiceCharacteristic(peripheralRetrievedInfo: any) {
  let result: {
    service: string | null;
    characteristic: string | null;
  } = {
    service: null,
    characteristic: null,
  };

  const {services, characteristics} = peripheralRetrievedInfo;

  if (!services || !characteristics) {
    return result;
  }

  // regular expression to make sure the value matches the type of uuid
  const regexUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  services.forEach((element: any) => {
    // we make sure it is a uuid that we add
    if (regexUUID.test(element.uuid)) {
      result.service = element.uuid;
    }
  });

  characteristics.forEach((element: any) => {
    // we make sure it is a uuid that we add
    if (regexUUID.test(element.characteristic)) {
      result.characteristic = element.characteristic;
    }
  });

  return result;
}

/**
 * Checks the support for crud made devices only - ignores the rest
 */
export function isPeripheralSupported(deviceName: Peripheral['name']) {
  const charList = deviceName?.split('::') ?? ['']; // default to something that wont match
  return charList[charList.length - 1] === BLE_SUPPORTED_NAME;
}
