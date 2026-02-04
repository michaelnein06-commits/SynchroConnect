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
    console.log('Image field value:', Contacts.Fields.Image);
    console.log('Note field value:', Contacts.Fields.Note);
    console.log('Addresses field value:', Contacts.Fields.Addresses);

    // Try to fetch with all fields
    let contacts: Contacts.Contact[] = [];
    
    // Build fields array - only include non-null fields
    const fieldsToFetch: Contacts.FieldType[] = [];
    
    if (Contacts.Fields.ID) fieldsToFetch.push(Contacts.Fields.ID);
    if (Contacts.Fields.Name) fieldsToFetch.push(Contacts.Fields.Name);
    if (Contacts.Fields.FirstName) fieldsToFetch.push(Contacts.Fields.FirstName);
    if (Contacts.Fields.LastName) fieldsToFetch.push(Contacts.Fields.LastName);
    if (Contacts.Fields.PhoneNumbers) fieldsToFetch.push(Contacts.Fields.PhoneNumbers);
    if (Contacts.Fields.Emails) fieldsToFetch.push(Contacts.Fields.Emails);
    if (Contacts.Fields.Company) fieldsToFetch.push(Contacts.Fields.Company);
    if (Contacts.Fields.JobTitle) fieldsToFetch.push(Contacts.Fields.JobTitle);
    if (Contacts.Fields.Birthday) fieldsToFetch.push(Contacts.Fields.Birthday);
    if (Contacts.Fields.Image) fieldsToFetch.push(Contacts.Fields.Image);
    if (Contacts.Fields.Note) fieldsToFetch.push(Contacts.Fields.Note);
    if (Contacts.Fields.Addresses) fieldsToFetch.push(Contacts.Fields.Addresses);
    
    console.log('Fields to fetch:', fieldsToFetch);

    try {
      console.log('Fetching contacts...');
      const result = await Contacts.getContactsAsync({
        fields: fieldsToFetch,
        pageSize: 10000,
      });
      
      console.log('Fetch result - total:', result?.total, 'data length:', result?.data?.length);
      
      if (result?.data?.length > 0) {
        contacts = result.data;
        
        // Debug first contact
        const firstContact = contacts[0];
        console.log('First contact keys:', Object.keys(firstContact));
        console.log('First contact birthday:', firstContact.birthday);
        console.log('First contact image:', firstContact.image ? 'YES' : 'NO');
        console.log('First contact note:', firstContact.note);
        console.log('First contact addresses:', firstContact.addresses);
        
        // Count contacts with each field
        const withBirthday = contacts.filter(c => c.birthday).length;
        const withImage = contacts.filter(c => c.image).length;
        const withNote = contacts.filter(c => c.note).length;
        const withAddresses = contacts.filter(c => c.addresses && c.addresses.length > 0).length;
        
        console.log('Contacts with birthday:', withBirthday);
        console.log('Contacts with image:', withImage);
        console.log('Contacts with note:', withNote);
        console.log('Contacts with addresses:', withAddresses);
        
        // Log first few birthdays if any
        const birthdayContacts = contacts.filter(c => c.birthday).slice(0, 3);
        birthdayContacts.forEach(c => {
          console.log(`Birthday example: ${c.name} -> ${JSON.stringify(c.birthday)}`);
        });
      }
    } catch (fetchError: any) {
      console.log('Fetch error:', fetchError?.message || fetchError);
      
      // Fallback to basic fields
      try {
        console.log('Trying fallback fetch...');
        const fallbackResult = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Name,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Emails,
          ],
          pageSize: 10000,
        });
        
        if (fallbackResult?.data) {
          contacts = fallbackResult.data;
          console.log('Fallback fetch got:', contacts.length, 'contacts');
        }
      } catch (fallbackError: any) {
        console.log('Fallback error:', fallbackError?.message);
      }
    }

    if (contacts.length === 0) {
      console.log('No contacts found');
      return [];
    }

    // Process contacts
    console.log('Processing', contacts.length, 'contacts...');
    
    const importedContacts: ImportedContact[] = [];
    let stats = { birthdays: 0, images: 0, notes: 0, addresses: 0 };

    for (const contact of contacts) {
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!name) continue;

      // Birthday
      let birthdayFormatted: string | undefined;
      let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
      
      if (contact.birthday) {
        birthdayRaw = {
          year: typeof contact.birthday.year === 'string' ? parseInt(contact.birthday.year) : contact.birthday.year,
          month: typeof contact.birthday.month === 'string' ? parseInt(contact.birthday.month) : contact.birthday.month,
          day: typeof contact.birthday.day === 'string' ? parseInt(contact.birthday.day) : contact.birthday.day,
        };
        birthdayFormatted = formatBirthday(contact.birthday);
        if (birthdayFormatted) stats.birthdays++;
      }

      // Addresses
      let location: string | undefined;
      let addressStrings: string[] = [];
      if (contact.addresses && contact.addresses.length > 0) {
        addressStrings = contact.addresses.map(addr => {
          const parts = [
            addr.street,
            addr.city, 
            addr.region,
            addr.postalCode,
            addr.country
          ].filter(Boolean);
          return parts.join(', ');
        }).filter(a => a.length > 0);
        
        location = addressStrings[0];
        if (location) stats.addresses++;
      }

      // Image to base64
      let imageBase64: string | undefined;
      if (contact.image?.uri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(contact.image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBase64 = `data:image/jpeg;base64,${base64}`;
          stats.images++;
        } catch (e) {
          // Silent fail
        }
      }

      // Note
      if (contact.note) stats.notes++;

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
        addresses: addressStrings,
      });
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
