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

    console.log('Starting contact import with ALL fields...');
    
    let allContacts: Contacts.Contact[] = [];
    
    // Try to get contacts with ALL fields including Birthday, Image, Note, Addresses
    try {
      console.log('Fetching with full fields...');
      
      // First try with Birthday field specifically
      console.log('Testing Birthday field...');
      try {
        const birthdayTest = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.Birthday],
          pageSize: 10,
        });
        console.log(`Birthday test: ${birthdayTest?.data?.length || 0} contacts`);
        if (birthdayTest?.data?.[0]?.birthday) {
          console.log('Birthday field WORKS!');
        } else {
          console.log('Birthday field returns no data');
        }
      } catch (birthdayErr: any) {
        console.log('Birthday field ERROR:', birthdayErr?.message);
      }
      
      // Now try full fetch
      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.ID,
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
        ],
        pageSize: 10000,
      });
      
      console.log('Full fields result:', result?.data?.length || 0);
      
      if (result?.data?.length > 0) {
        allContacts = result.data;
        console.log(`Full fields fetch: ${allContacts.length} contacts`);
        
        // Check what we got
        const withBirthday = allContacts.filter(c => c.birthday);
        const withImage = allContacts.filter(c => c.image);
        const withNote = allContacts.filter(c => c.note);
        const withAddress = allContacts.filter(c => c.addresses?.length);
        
        console.log(`Direct fetch results:`);
        console.log(`- With birthday: ${withBirthday.length}`);
        console.log(`- With image: ${withImage.length}`);
        console.log(`- With note: ${withNote.length}`);
        console.log(`- With address: ${withAddress.length}`);
        
        if (withBirthday.length > 0) {
          console.log(`Sample birthday: ${withBirthday[0].name} -> ${JSON.stringify(withBirthday[0].birthday)}`);
        }
      } else {
        console.log('Full fields returned 0 contacts');
      }
    } catch (e: any) {
      console.log('Full fields fetch ERROR:', e?.message || String(e));
    }
    
    // Fallback: basic fields only
    if (allContacts.length === 0) {
      try {
        console.log('Fallback: basic fields only...');
        const result = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Name,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Emails,
            Contacts.Fields.ID,
          ],
          pageSize: 10000,
        });
        
        if (result?.data?.length > 0) {
          allContacts = result.data;
          console.log(`Basic fetch: ${allContacts.length} contacts`);
        }
      } catch (e: any) {
        console.log('Basic fetch error:', e?.message);
      }
    }
    
    if (allContacts.length === 0) {
      console.log('No contacts found');
      return [];
    }
    
    // Process contacts
    console.log(`Processing ${allContacts.length} contacts...`);
    
    const importedContacts: ImportedContact[] = [];
    let birthdayCount = 0;
    let imageCount = 0;
    let noteCount = 0;
    let addressCount = 0;
    
    for (let i = 0; i < allContacts.length; i++) {
      const contact = allContacts[i];
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!name) continue;
      
      // Use data directly from the contact (already fetched with all fields)
      let birthday = contact.birthday;
      let image = contact.image;
      let note = contact.note;
      let addresses = contact.addresses || [];
      
      // If birthday/image missing, try individual fetch as last resort
      if (contact.id && !birthday && !image) {
        try {
          const fullContact = await Contacts.getContactByIdAsync(contact.id, [
            Contacts.Fields.Birthday,
            Contacts.Fields.Image,
            Contacts.Fields.Note,
            Contacts.Fields.Addresses,
          ]);
          
          if (fullContact) {
            birthday = fullContact.birthday || birthday;
            image = fullContact.image || image;
            note = fullContact.note || note;
            addresses = fullContact.addresses || addresses;
          }
        } catch (e) {
          // Silent fail
        }
      }
      
      // Parse birthday
      let birthdayFormatted: string | undefined;
      let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
      
      if (birthday) {
        birthdayRaw = {
          year: birthday.year,
          month: birthday.month,
          day: birthday.day
        };
        birthdayFormatted = formatBirthday(birthday);
        birthdayCount++;
        
        if (birthdayCount <= 3) {
          console.log(`Birthday found: ${name} -> ${birthdayFormatted}`);
        }
      }
      
      // Extract address
      let location: string | undefined;
      let addressStrings: string[] = [];
      if (addresses && addresses.length > 0) {
        addressStrings = addresses.map((addr: any) => {
          const parts = [addr.street, addr.city, addr.region, addr.postalCode, addr.country].filter(Boolean);
          return parts.join(', ');
        }).filter((a: string) => a.length > 0);
        location = addressStrings[0];
        if (location) addressCount++;
      }
      
      // Convert image to base64
      let imageBase64: string | undefined;
      if (image?.uri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBase64 = `data:image/jpeg;base64,${base64}`;
          imageCount++;
        } catch (imgErr) {
          // Silent fail
        }
      }
      
      if (note) noteCount++;
      
      importedContacts.push({
        name,
        phoneNumbers: contact.phoneNumbers?.map(p => p.number || '').filter(Boolean) || [],
        emails: contact.emails?.map(e => e.email || '').filter(Boolean) || [],
        company: contact.company,
        jobTitle: contact.jobTitle,
        birthday: birthdayFormatted,
        birthdayRaw,
        image,
        imageBase64,
        id: contact.id,
        note,
        location,
        addresses: addressStrings,
      });
    }

    console.log('=== IMPORT COMPLETE ===');
    console.log(`Total: ${importedContacts.length}`);
    console.log(`Birthdays: ${birthdayCount}`);
    console.log(`Images: ${imageCount}`);
    console.log(`Notes: ${noteCount}`);
    console.log(`Addresses: ${addressCount}`);
    
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
