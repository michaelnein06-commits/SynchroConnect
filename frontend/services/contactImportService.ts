import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  image?: any;
  id?: string;
}

export async function requestContactsPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Contacts.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Contacts.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.error('Error requesting contacts permission:', error);
    return false;
  }
}

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    const hasPermission = await requestContactsPermission();
    
    if (!hasPermission) {
      throw new Error('Contacts permission not granted');
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.Name,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
        Contacts.Fields.Company,
        Contacts.Fields.JobTitle,
        Contacts.Fields.Birthday,
        Contacts.Fields.Image,
        Contacts.Fields.ID,
      ],
    });

    const importedContacts: ImportedContact[] = data
      .filter((contact) => contact.name) // Only contacts with names
      .map((contact) => ({
        name: contact.name || 'Unknown',
        phoneNumbers: contact.phoneNumbers?.map((p) => p.number || '') || [],
        emails: contact.emails?.map((e) => e.email || '') || [],
        company: contact.company,
        jobTitle: contact.jobTitle,
        birthday: contact.birthday ? new Date(contact.birthday.year || 2000, (contact.birthday.month || 1) - 1, contact.birthday.day || 1).toLocaleDateString() : undefined,
        image: contact.image,
        id: contact.id,
      }));

    console.log(`Imported ${importedContacts.length} contacts with full data`);
    return importedContacts;
  } catch (error) {
    console.error('Error importing contacts:', error);
    throw error;
  }
}

export function formatContactForCRM(importedContact: ImportedContact) {
  return {
    name: importedContact.name,
    job: importedContact.jobTitle || importedContact.company || '',
    tags: [],
    pipeline_stage: 'Monthly',
    notes: `Imported from phone contacts${importedContact.phoneNumbers && importedContact.phoneNumbers.length > 0 ? ` - ${importedContact.phoneNumbers[0]}` : ''}`,
  };
}
