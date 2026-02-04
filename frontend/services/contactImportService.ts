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

// Helper to format birthday - handles both string and number values
function formatBirthday(birthday?: { year?: number | string; month?: number | string; day?: number | string }): string {
  if (!birthday) return '';
  
  // Convert to numbers (expo-contacts can return strings or numbers)
  const year = typeof birthday.year === 'string' ? parseInt(birthday.year) : (birthday.year || 2000);
  // expo-contacts month is 0-indexed on iOS
  const monthRaw = typeof birthday.month === 'string' ? parseInt(birthday.month) : birthday.month;
  const month = monthRaw !== undefined ? monthRaw + 1 : 1; // Convert to 1-indexed
  const day = typeof birthday.day === 'string' ? parseInt(birthday.day) : (birthday.day || 1);
  
  if (isNaN(month) || isNaN(day)) return '';
  
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

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    if (Platform.OS === 'web') {
      console.log('Contacts not available on web');
      return [];
    }

    console.log('=== CONTACT IMPORT START ===');
    
    // Request permission
    const { status } = await Contacts.getPermissionsAsync();
    console.log('Permission status:', status);
    
    if (status !== 'granted') {
      const { status: newStatus } = await Contacts.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlaube Zugriff auf Kontakte in den Einstellungen.');
        return [];
      }
    }

    // Log available fields for debugging
    console.log('Available Contacts.Fields:', Object.keys(Contacts.Fields));
    console.log('Birthday field value:', Contacts.Fields.Birthday);

    // Try to fetch with all fields
    let contacts: Contacts.Contact[] = [];
    
    // FIRST: Get basic contact list (this should always work)
    try {
      console.log('Step 1: Getting basic contact list...');
      const basicResult = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.ID,
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
        pageSize: 10000,
      });
      
      console.log('Basic result - total:', basicResult?.total, 'data:', basicResult?.data?.length);
      
      if (basicResult?.data?.length > 0) {
        contacts = basicResult.data;
      }
    } catch (e: any) {
      console.log('Basic fetch error:', e?.message);
    }
    
    if (contacts.length === 0) {
      console.log('No contacts from basic fetch, trying without fields...');
      try {
        const noFieldResult = await Contacts.getContactsAsync({});
        console.log('No-field result:', noFieldResult?.data?.length);
        if (noFieldResult?.data) {
          contacts = noFieldResult.data;
        }
      } catch (e: any) {
        console.log('No-field fetch error:', e?.message);
      }
    }
    
    if (contacts.length === 0) {
      console.log('Still no contacts, returning empty');
      return [];
    }
    
    console.log('Got', contacts.length, 'basic contacts');
    
    // SECOND: For each contact, fetch extended data individually
    console.log('Step 2: Fetching extended data for each contact...');
    
    const importedContacts: ImportedContact[] = [];
    let stats = { birthdays: 0, images: 0, notes: 0, addresses: 0 };
    
    for (let i = 0; i < contacts.length; i++) {
      const basicContact = contacts[i];
      const name = basicContact.name || `${basicContact.firstName || ''} ${basicContact.lastName || ''}`.trim();
      if (!name) continue;
      
      // Try to get extended data for this contact
      let birthday: any = undefined;
      let image: any = undefined;
      let note: string | undefined = undefined;
      let addresses: any[] = [];
      let company: string | undefined = basicContact.company;
      let jobTitle: string | undefined = basicContact.jobTitle;
      
      if (basicContact.id) {
        try {
          const fullContact = await Contacts.getContactByIdAsync(basicContact.id, [
            Contacts.Fields.Birthday,
            Contacts.Fields.Image,
            Contacts.Fields.Note,
            Contacts.Fields.Addresses,
            Contacts.Fields.Company,
            Contacts.Fields.JobTitle,
          ]);
          
          if (fullContact) {
            birthday = fullContact.birthday;
            image = fullContact.image;
            note = fullContact.note;
            addresses = fullContact.addresses || [];
            company = fullContact.company || company;
            jobTitle = fullContact.jobTitle || jobTitle;
            
            if (birthday && i < 3) {
              console.log(`Found birthday for ${name}:`, JSON.stringify(birthday));
            }
          }
        } catch (e) {
          // Individual fetch failed, continue with basic data
        }
      }

      // Birthday
      let birthdayFormatted: string | undefined;
      let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
      
      if (birthday) {
        birthdayRaw = {
          year: typeof birthday.year === 'string' ? parseInt(birthday.year) : birthday.year,
          month: typeof birthday.month === 'string' ? parseInt(birthday.month) : birthday.month,
          day: typeof birthday.day === 'string' ? parseInt(birthday.day) : birthday.day,
        };
        birthdayFormatted = formatBirthday(birthday);
        if (birthdayFormatted) stats.birthdays++;
      }

      // Addresses
      let location: string | undefined;
      let addressStrings: string[] = [];
      if (addresses && addresses.length > 0) {
        addressStrings = addresses.map((addr: any) => {
          const parts = [
            addr.street,
            addr.city, 
            addr.region,
            addr.postalCode,
            addr.country
          ].filter(Boolean);
          return parts.join(', ');
        }).filter((a: string) => a.length > 0);
        
        location = addressStrings[0];
        if (location) stats.addresses++;
      }

      // Image to base64
      let imageBase64: string | undefined;
      if (image?.uri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBase64 = `data:image/jpeg;base64,${base64}`;
          stats.images++;
        } catch (e) {
          // Silent fail
        }
      }

      // Note
      if (note) stats.notes++;

      importedContacts.push({
        name,
        phoneNumbers: basicContact.phoneNumbers?.map(p => p.number || '').filter(Boolean) || [],
        emails: basicContact.emails?.map(e => e.email || '').filter(Boolean) || [],
        company,
        jobTitle,
        birthday: birthdayFormatted,
        birthdayRaw,
        image,
        imageBase64,
        id: basicContact.id,
        note,
        location,
        addresses: addressStrings,
      });
      
      // Progress log
      if ((i + 1) % 50 === 0) {
        console.log(`Progress: ${i + 1}/${contacts.length} (${stats.birthdays} birthdays found)`);
      }
    }

    console.log('=== IMPORT COMPLETE ===');
    console.log('Total contacts:', importedContacts.length);
    console.log('With birthday:', stats.birthdays);
    console.log('With image:', stats.images);
    console.log('With note:', stats.notes);
    console.log('With address:', stats.addresses);

    // Show alert if no extended data
    if (stats.birthdays === 0 && stats.images === 0 && importedContacts.length > 5) {
      Alert.alert(
        'Eingeschränkter Zugriff erkannt',
        'Geburtstage und Bilder konnten nicht gelesen werden.\n\n' +
        'Lösung:\n' +
        '1. Gehe zu Einstellungen → Datenschutz → Kontakte\n' +
        '2. Deaktiviere den Zugriff für Expo Go\n' +
        '3. Aktiviere ihn wieder und wähle "Voller Zugriff"\n' +
        '4. Versuche den Import erneut',
        [
          { text: 'OK' },
          { text: 'Einstellungen', onPress: () => Linking.openSettings() },
        ]
      );
    }

    return importedContacts;
  } catch (error: any) {
    console.error('Import error:', error?.message || error);
    throw error;
  }
}

export function formatContactForCRM(importedContact: ImportedContact) {
  return {
    name: importedContact.name,
    job: importedContact.jobTitle || importedContact.company || '',
    phone: importedContact.phoneNumbers?.[0] || '',
    email: importedContact.emails?.[0] || '',
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
