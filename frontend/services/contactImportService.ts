import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert, Linking } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  birthdayRaw?: {
    year?: number;
    month?: number;
    day?: number;
  };
  image?: any;
  imageBase64?: string;
  id?: string;
  note?: string;
  location?: string;
  addresses?: string[];
}

// Helper to format birthday from expo-contacts format
function formatBirthday(birthday?: { year?: number; month?: number; day?: number }): string {
  if (!birthday) return '';
  
  // expo-contacts uses 0-indexed months (January = 0)
  const year = birthday.year || 2000;
  const month = (birthday.month !== undefined ? birthday.month : 0) + 1;
  const day = birthday.day || 1;
  
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  
  return `${year}-${monthStr}-${dayStr}`;
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

export async function checkContactAccessLevel(): Promise<'full' | 'limited' | 'denied'> {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    
    if (status !== 'granted') {
      return 'denied';
    }
    
    const result = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name],
      pageSize: 1000,
    });
    
    return result.data.length > 0 ? 'full' : 'limited';
  } catch (error) {
    return 'denied';
  }
}

export function showFullAccessAlert() {
  Alert.alert(
    'Limited Contact Access',
    'You\'ve only granted access to some contacts. To import all your contacts:\n\n1. Go to Settings\n2. Find this app\n3. Tap "Contacts"\n4. Select "Full Access"',
    [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Open Settings', 
        onPress: () => Linking.openSettings() 
      },
    ]
  );
}

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    if (Platform.OS === 'web') {
      console.log('Contacts not available on web');
      return [];
    }

    console.log('Requesting contacts permission...');
    const { status: existingStatus } = await Contacts.getPermissionsAsync();
    console.log('Current permission status:', existingStatus);
    
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Contacts.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant contact access in Settings to import contacts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      throw new Error('Contacts permission not granted');
    }

    console.log('Starting contact import...');
    
    // Get all contacts with ALL fields in one request
    let allContacts: Contacts.Contact[] = [];
    
    try {
      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Company,
          Contacts.Fields.JobTitle,
          Contacts.Fields.Birthday,
          Contacts.Fields.Image,
          Contacts.Fields.Note,
          Contacts.Fields.Addresses,
          Contacts.Fields.ID,
        ],
        pageSize: 10000,
      });
      
      if (result && result.data) {
        allContacts = result.data;
        console.log(`Fetched ${allContacts.length} contacts`);
      }
    } catch (e: any) {
      console.log('Fetch error:', e?.message || e);
    }
    
    if (allContacts.length === 0) {
      console.log('No contacts found, returning empty');
      return [];
    }
    
    // Process contacts directly without individual fetch
    const importedContacts: ImportedContact[] = [];
    let birthdayCount = 0;
    let imageCount = 0;
    let noteCount = 0;
    let addressCount = 0;
    
    for (const contact of allContacts) {
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!name) continue;
      
      // Parse birthday
      let birthdayFormatted: string | undefined;
      let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
      
      if (contact.birthday) {
        birthdayRaw = {
          year: contact.birthday.year,
          month: contact.birthday.month,
          day: contact.birthday.day
        };
        birthdayFormatted = formatBirthday(contact.birthday);
        birthdayCount++;
        
        if (birthdayCount <= 3) {
          console.log(`Birthday: ${name} -> ${birthdayFormatted}`);
        }
      }
      
      // Extract address
      let location: string | undefined;
      let addresses: string[] = [];
      if (contact.addresses && contact.addresses.length > 0) {
        addresses = contact.addresses.map(addr => {
          const parts = [addr.street, addr.city, addr.region, addr.postalCode, addr.country].filter(Boolean);
          return parts.join(', ');
        }).filter(a => a.length > 0);
        location = addresses[0];
        if (location) addressCount++;
      }
      
      // Convert image to base64
      let imageBase64: string | undefined;
      if (contact.image?.uri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(contact.image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBase64 = `data:image/jpeg;base64,${base64}`;
          imageCount++;
        } catch (imgErr) {
          // Silent fail
        }
      }
      
      if (contact.note) noteCount++;
      
      importedContacts.push({
        name,
        phoneNumbers: contact.phoneNumbers?.map(p => p.number || '').filter(Boolean) || [],
        emails: contact.emails?.map(e => e.email || '').filter(Boolean) || [],
        company: contact.company,
        jobTitle: contact.jobTitle,
        birthday: birthdayFormatted,
        birthdayRaw,
        image: contact.image,
        imageBase64,
        id: contact.id,
        note: contact.note,
        location,
        addresses,
      });
    }

    console.log('=== IMPORT COMPLETE ===');
    console.log(`Total: ${importedContacts.length}`);
    console.log(`Birthdays: ${birthdayCount}`);
    console.log(`Images: ${imageCount}`);
    console.log(`Notes: ${noteCount}`);
    console.log(`Addresses: ${addressCount}`);
    console.log('=======================');
    
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
    phone: importedContact.phoneNumbers && importedContact.phoneNumbers.length > 0 ? importedContact.phoneNumbers[0] : '',
    email: importedContact.emails && importedContact.emails.length > 0 ? importedContact.emails[0] : '',
    birthday: importedContact.birthday || '',
    profile_picture: importedContact.imageBase64 || '',
    device_contact_id: importedContact.id || '',
    tags: [],
    groups: [],
    pipeline_stage: 'New',
    language: 'English',
    tone: 'Casual',
    notes: importedContact.note || '',
    location: importedContact.location || '',
  };
}
