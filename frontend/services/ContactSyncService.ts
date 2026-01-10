import * as Contacts from 'expo-contacts';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { importPhoneContacts, ImportedContact, requestContactsPermission } from './contactImportService';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const LAST_SYNC_KEY = 'last_contact_sync';

interface AppContact {
  id?: string;
  _id?: string;
  name: string;
  phone?: string;
  email?: string;
  birthday?: string;
  job?: string;
  location?: string;
  notes?: string;
  device_contact_id?: string;
  pipeline_stage?: string;
}

interface SyncResult {
  imported: number;
  updated: number;
  syncedBack: number;
  errors: string[];
}

/**
 * Contact Sync Service
 * Handles bidirectional sync between app and device contacts
 */
export class ContactSyncService {
  private token: string;
  private onProgress?: (message: string) => void;

  constructor(token: string, onProgress?: (message: string) => void) {
    this.token = token;
    this.onProgress = onProgress;
  }

  private log(message: string) {
    console.log(`[ContactSync] ${message}`);
    this.onProgress?.(message);
  }

  private getAuthHeaders() {
    return { headers: { Authorization: `Bearer ${this.token}` } };
  }

  /**
   * Normalize phone number for comparison
   */
  private normalizePhone(phone?: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10); // Last 10 digits
  }

  /**
   * Get all contacts from app
   */
  async getAppContacts(): Promise<AppContact[]> {
    try {
      const response = await axios.get(
        `${EXPO_PUBLIC_BACKEND_URL}/api/contacts`,
        this.getAuthHeaders()
      );
      return response.data || [];
    } catch (error) {
      console.error('Error fetching app contacts:', error);
      return [];
    }
  }

  /**
   * Convert ImportedContact to format for comparison
   */
  private formatImportedContact(contact: ImportedContact): Partial<AppContact> {
    return {
      name: contact.name,
      phone: contact.phoneNumbers?.[0] || undefined,
      email: contact.emails?.[0] || undefined,
      birthday: contact.birthday || undefined,
      job: contact.jobTitle || contact.company || undefined,
      device_contact_id: contact.id,
      pipeline_stage: 'New',
    };
  }

  /**
   * Update device contact with app data
   */
  async updateDeviceContact(deviceContactId: string, appContact: AppContact): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        return false;
      }

      // Get current device contact
      const contact = await Contacts.getContactByIdAsync(deviceContactId, [
        Contacts.Fields.Name,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
        Contacts.Fields.Birthday,
        Contacts.Fields.JobTitle,
        Contacts.Fields.Addresses,
        Contacts.Fields.Note,
      ]);

      if (!contact) {
        this.log(`Device contact not found: ${deviceContactId}`);
        return false;
      }

      // Prepare updates
      const updates: Partial<Contacts.Contact> = {
        id: deviceContactId,
      };

      // Update name if changed
      if (appContact.name && appContact.name !== contact.name) {
        const nameParts = appContact.name.split(' ');
        updates.firstName = nameParts[0] || '';
        updates.lastName = nameParts.slice(1).join(' ') || '';
      }

      // Update phone if provided
      if (appContact.phone) {
        updates.phoneNumbers = [{
          label: 'mobile',
          number: appContact.phone,
        }];
      }

      // Update email if provided
      if (appContact.email) {
        updates.emails = [{
          label: 'home',
          email: appContact.email,
        }];
      }

      // Update birthday if provided
      if (appContact.birthday) {
        try {
          const date = new Date(appContact.birthday);
          if (!isNaN(date.getTime())) {
            updates.birthday = {
              year: date.getFullYear(),
              month: date.getMonth(),
              day: date.getDate(),
            };
          }
        } catch (e) {
          // Skip invalid birthday
        }
      }

      // Update job title
      if (appContact.job) {
        updates.jobTitle = appContact.job;
      }

      // Update notes
      if (appContact.notes) {
        updates.note = appContact.notes;
      }

      // Apply updates
      await Contacts.updateContactAsync(updates as Contacts.Contact);
      this.log(`✓ Synced to device: ${appContact.name}`);
      return true;
    } catch (error) {
      console.error('Error updating device contact:', error);
      return false;
    }
  }

  /**
   * Create new contact on device from app
   */
  async createDeviceContact(appContact: AppContact): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return null;
      }

      const nameParts = (appContact.name || 'Unknown').split(' ');
      
      const newContact: Contacts.Contact = {
        contactType: Contacts.ContactTypes.Person,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        name: appContact.name,
      };

      if (appContact.phone) {
        newContact.phoneNumbers = [{
          label: 'mobile',
          number: appContact.phone,
        }];
      }

      if (appContact.email) {
        newContact.emails = [{
          label: 'home',
          email: appContact.email,
        }];
      }

      if (appContact.birthday) {
        try {
          const date = new Date(appContact.birthday);
          if (!isNaN(date.getTime())) {
            newContact.birthday = {
              year: date.getFullYear(),
              month: date.getMonth(),
              day: date.getDate(),
            };
          }
        } catch (e) {
          // Skip invalid birthday
        }
      }

      if (appContact.job) {
        newContact.jobTitle = appContact.job;
      }

      if (appContact.notes) {
        newContact.note = appContact.notes;
      }

      const contactId = await Contacts.addContactAsync(newContact);
      this.log(`✓ Created on device: ${appContact.name}`);
      return contactId;
    } catch (error) {
      console.error('Error creating device contact:', error);
      return null;
    }
  }

  /**
   * Import new contact to app from device
   */
  async importToApp(deviceContact: ImportedContact): Promise<AppContact | null> {
    try {
      const contactData = {
        name: deviceContact.name,
        phone: deviceContact.phoneNumbers?.[0] || '',
        email: deviceContact.emails?.[0] || '',
        birthday: deviceContact.birthday || '',
        job: deviceContact.jobTitle || deviceContact.company || '',
        device_contact_id: deviceContact.id || '',
        pipeline_stage: 'New',
        language: 'English',
        tone: 'Casual',
        notes: 'Synced from device',
      };
      
      const response = await axios.post(
        `${EXPO_PUBLIC_BACKEND_URL}/api/contacts`,
        contactData,
        this.getAuthHeaders()
      );
      
      this.log(`✓ Imported: ${contactData.name}`);
      return response.data;
    } catch (error) {
      console.error('Error importing contact:', error);
      return null;
    }
  }

  /**
   * Update app contact
   */
  async updateAppContact(contactId: string, data: Partial<AppContact>): Promise<boolean> {
    try {
      await axios.put(
        `${EXPO_PUBLIC_BACKEND_URL}/api/contacts/${contactId}`,
        data,
        this.getAuthHeaders()
      );
      return true;
    } catch (error) {
      console.error('Error updating app contact:', error);
      return false;
    }
  }

  /**
   * Full bidirectional sync
   */
  async performFullSync(): Promise<SyncResult> {
    const result: SyncResult = {
      imported: 0,
      updated: 0,
      syncedBack: 0,
      errors: [],
    };

    try {
      // Check platform
      if (Platform.OS === 'web') {
        result.errors.push('Sync not available on web');
        return result;
      }

      // Request permission
      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        result.errors.push('Contact permission denied');
        return result;
      }

      this.log('Starting sync...');

      // Get contacts using the WORKING import function
      let deviceContacts: ImportedContact[] = [];
      try {
        deviceContacts = await importPhoneContacts();
      } catch (e) {
        this.log('Failed to get device contacts');
        result.errors.push('Failed to read device contacts');
        return result;
      }

      // Get app contacts
      const appContacts = await this.getAppContacts();

      this.log(`Found ${deviceContacts.length} device contacts, ${appContacts.length} app contacts`);

      // Create lookup maps for app contacts
      const appContactsByDeviceId = new Map<string, AppContact>();
      const appContactsByPhone = new Map<string, AppContact>();
      const appContactsByEmail = new Map<string, AppContact>();
      const appContactsByName = new Map<string, AppContact>();

      for (const contact of appContacts) {
        if (contact.device_contact_id) {
          appContactsByDeviceId.set(contact.device_contact_id, contact);
        }
        if (contact.phone) {
          const normalizedPhone = this.normalizePhone(contact.phone);
          if (normalizedPhone) {
            appContactsByPhone.set(normalizedPhone, contact);
          }
        }
        if (contact.email) {
          appContactsByEmail.set(contact.email.toLowerCase(), contact);
        }
        if (contact.name) {
          appContactsByName.set(contact.name.toLowerCase(), contact);
        }
      }

      // STEP 1: Device → App (import new contacts)
      this.log('Syncing device → app...');
      for (const deviceContact of deviceContacts) {
        if (!deviceContact.name) continue;

        // Check if already linked by device_contact_id
        let existingAppContact: AppContact | undefined;
        
        if (deviceContact.id) {
          existingAppContact = appContactsByDeviceId.get(deviceContact.id);
        }

        // If not linked, check by phone, email, or name
        if (!existingAppContact) {
          const phone = this.normalizePhone(deviceContact.phoneNumbers?.[0]);
          const email = deviceContact.emails?.[0]?.toLowerCase();
          const name = deviceContact.name.toLowerCase();
          
          if (phone) {
            existingAppContact = appContactsByPhone.get(phone);
          }
          if (!existingAppContact && email) {
            existingAppContact = appContactsByEmail.get(email);
          }
          if (!existingAppContact) {
            existingAppContact = appContactsByName.get(name);
          }
        }

        if (existingAppContact) {
          // Link existing contact if not linked yet
          if (!existingAppContact.device_contact_id && deviceContact.id) {
            const contactId = existingAppContact._id || existingAppContact.id;
            if (contactId) {
              await this.updateAppContact(contactId, {
                device_contact_id: deviceContact.id,
              });
              this.log(`Linked: ${existingAppContact.name}`);
            }
          }
        } else {
          // Import new contact
          const imported = await this.importToApp(deviceContact);
          if (imported) {
            result.imported++;
            // Add to maps to prevent duplicates
            if (deviceContact.id) {
              appContactsByDeviceId.set(deviceContact.id, imported);
            }
          }
        }
      }

      // STEP 2: App → Device (sync changes back)
      this.log('Syncing app → device...');
      
      // Refresh app contacts after imports
      const updatedAppContacts = await this.getAppContacts();
      
      for (const appContact of updatedAppContacts) {
        const contactId = appContact._id || appContact.id;
        if (!contactId) continue;

        if (appContact.device_contact_id) {
          // Update existing device contact
          const success = await this.updateDeviceContact(
            appContact.device_contact_id,
            appContact
          );
          if (success) {
            result.syncedBack++;
          }
        } else {
          // Create new contact on device and link it
          const deviceId = await this.createDeviceContact(appContact);
          if (deviceId) {
            await this.updateAppContact(contactId, {
              device_contact_id: deviceId,
            });
            result.syncedBack++;
            this.log(`Created & linked: ${appContact.name}`);
          }
        }
      }

      // Save last sync time
      await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      
      this.log(`✓ Sync complete! Imported: ${result.imported}, Synced to device: ${result.syncedBack}`);
      return result;

    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown sync error';
      result.errors.push(errorMsg);
      console.error('Sync error:', error);
      return result;
    }
  }

  /**
   * Quick sync - only check for new contacts from device
   */
  async quickSync(): Promise<{ newContacts: number }> {
    try {
      if (Platform.OS === 'web') {
        return { newContacts: 0 };
      }

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) return { newContacts: 0 };

      // Use the working import function
      let deviceContacts: ImportedContact[] = [];
      try {
        deviceContacts = await importPhoneContacts();
      } catch (e) {
        return { newContacts: 0 };
      }

      const appContacts = await this.getAppContacts();

      // Build sets for checking existing contacts
      const existingDeviceIds = new Set<string>();
      const existingPhones = new Set<string>();
      const existingEmails = new Set<string>();
      const existingNames = new Set<string>();

      for (const c of appContacts) {
        if (c.device_contact_id) existingDeviceIds.add(c.device_contact_id);
        if (c.phone) existingPhones.add(this.normalizePhone(c.phone));
        if (c.email) existingEmails.add(c.email.toLowerCase());
        if (c.name) existingNames.add(c.name.toLowerCase());
      }

      // Find and import new contacts
      let newContacts = 0;
      for (const deviceContact of deviceContacts) {
        if (!deviceContact.name) continue;
        
        // Skip if already exists
        if (deviceContact.id && existingDeviceIds.has(deviceContact.id)) continue;
        
        const phone = this.normalizePhone(deviceContact.phoneNumbers?.[0]);
        const email = deviceContact.emails?.[0]?.toLowerCase();
        const name = deviceContact.name.toLowerCase();
        
        if (phone && existingPhones.has(phone)) continue;
        if (email && existingEmails.has(email)) continue;
        if (existingNames.has(name)) continue;

        // Import this new contact
        const imported = await this.importToApp(deviceContact);
        if (imported) {
          newContacts++;
          // Add to sets to prevent duplicates
          if (phone) existingPhones.add(phone);
          if (email) existingEmails.add(email);
          existingNames.add(name);
        }
      }

      return { newContacts };
    } catch (error) {
      console.error('Quick sync error:', error);
      return { newContacts: 0 };
    }
  }

  /**
   * Sync single contact back to device (call after saving a contact)
   */
  async syncContactToDevice(appContact: AppContact): Promise<boolean> {
    try {
      if (Platform.OS === 'web') return false;

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) return false;

      const contactId = appContact._id || appContact.id;

      if (appContact.device_contact_id) {
        // Update existing device contact
        return await this.updateDeviceContact(appContact.device_contact_id, appContact);
      } else if (contactId) {
        // Create new device contact and link it
        const deviceId = await this.createDeviceContact(appContact);
        if (deviceId) {
          await this.updateAppContact(contactId, {
            device_contact_id: deviceId,
          });
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error syncing contact to device:', error);
      return false;
    }
  }

  /**
   * Sync all app contacts TO device (App → iPhone)
   * This pushes changes made in the app to iPhone contacts
   * Does NOT import new contacts from device
   */
  async syncAppToDevice(): Promise<{ syncedBack: number; errors: string[] }> {
    const result = { syncedBack: 0, errors: [] as string[] };

    try {
      if (Platform.OS === 'web') {
        result.errors.push('Sync not available on web');
        return result;
      }

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        result.errors.push('Contact permission denied');
        return result;
      }

      this.log('Syncing app → device...');

      // Get app contacts
      const appContacts = await this.getAppContacts();
      this.log(`Found ${appContacts.length} app contacts to sync`);

      // Get device contacts to find matches
      let deviceContacts: ImportedContact[] = [];
      try {
        deviceContacts = await importPhoneContacts();
      } catch (e) {
        this.log('Failed to get device contacts');
      }

      // Create device contact lookup by name/phone/email
      const deviceByName = new Map<string, string>();
      const deviceByPhone = new Map<string, string>();
      const deviceByEmail = new Map<string, string>();

      for (const dc of deviceContacts) {
        if (dc.id && dc.name) {
          deviceByName.set(dc.name.toLowerCase(), dc.id);
        }
        if (dc.id && dc.phoneNumbers?.[0]) {
          deviceByPhone.set(this.normalizePhone(dc.phoneNumbers[0]), dc.id);
        }
        if (dc.id && dc.emails?.[0]) {
          deviceByEmail.set(dc.emails[0].toLowerCase(), dc.id);
        }
      }

      for (const appContact of appContacts) {
        const contactId = appContact._id || appContact.id;
        if (!contactId) continue;

        let deviceContactId = appContact.device_contact_id;

        // Try to find matching device contact if not linked
        if (!deviceContactId) {
          const name = appContact.name?.toLowerCase();
          const phone = this.normalizePhone(appContact.phone);
          const email = appContact.email?.toLowerCase();

          if (phone && deviceByPhone.has(phone)) {
            deviceContactId = deviceByPhone.get(phone);
          } else if (email && deviceByEmail.has(email)) {
            deviceContactId = deviceByEmail.get(email);
          } else if (name && deviceByName.has(name)) {
            deviceContactId = deviceByName.get(name);
          }

          // Link if found
          if (deviceContactId) {
            await this.updateAppContact(contactId, { device_contact_id: deviceContactId });
            appContact.device_contact_id = deviceContactId;
            this.log(`Linked: ${appContact.name}`);
          }
        }

        if (deviceContactId) {
          // Update existing device contact
          const success = await this.updateDeviceContact(deviceContactId, appContact);
          if (success) {
            result.syncedBack++;
          }
        } else {
          // Create new device contact and link it
          const newDeviceId = await this.createDeviceContact(appContact);
          if (newDeviceId) {
            await this.updateAppContact(contactId, { device_contact_id: newDeviceId });
            result.syncedBack++;
            this.log(`Created & linked: ${appContact.name}`);
          }
        }
      }

      this.log(`✓ Sync complete! ${result.syncedBack} contacts synced to device`);
      return result;

    } catch (error: any) {
      result.errors.push(error?.message || 'Unknown error');
      console.error('Sync to device error:', error);
      return result;
    }
  }

  /**
   * Link existing app contacts with device contacts (without importing new ones)
   * Useful for reconnecting after contacts have been re-imported
   */
  async linkExistingContacts(): Promise<{ linked: number; errors: string[] }> {
    const result = { linked: 0, errors: [] as string[] };

    try {
      if (Platform.OS === 'web') {
        result.errors.push('Not available on web');
        return result;
      }

      const hasPermission = await requestContactsPermission();
      if (!hasPermission) {
        result.errors.push('Contact permission denied');
        return result;
      }

      this.log('Linking contacts...');

      // Get contacts from both sources
      let deviceContacts: ImportedContact[] = [];
      try {
        deviceContacts = await importPhoneContacts();
      } catch (e) {
        result.errors.push('Failed to read device contacts');
        return result;
      }

      const appContacts = await this.getAppContacts();

      this.log(`Found ${deviceContacts.length} device contacts, ${appContacts.length} app contacts`);

      // Create device contact lookup
      const deviceByPhone = new Map<string, ImportedContact>();
      const deviceByEmail = new Map<string, ImportedContact>();
      const deviceByName = new Map<string, ImportedContact>();

      for (const dc of deviceContacts) {
        if (dc.phoneNumbers?.[0]) {
          deviceByPhone.set(this.normalizePhone(dc.phoneNumbers[0]), dc);
        }
        if (dc.emails?.[0]) {
          deviceByEmail.set(dc.emails[0].toLowerCase(), dc);
        }
        if (dc.name) {
          deviceByName.set(dc.name.toLowerCase(), dc);
        }
      }

      // Link app contacts that don't have device_contact_id yet
      for (const appContact of appContacts) {
        if (appContact.device_contact_id) continue; // Already linked

        const contactId = appContact._id || appContact.id;
        if (!contactId) continue;

        // Try to find matching device contact
        let matchedDevice: ImportedContact | undefined;

        const phone = this.normalizePhone(appContact.phone);
        const email = appContact.email?.toLowerCase();
        const name = appContact.name?.toLowerCase();

        if (phone && deviceByPhone.has(phone)) {
          matchedDevice = deviceByPhone.get(phone);
        } else if (email && deviceByEmail.has(email)) {
          matchedDevice = deviceByEmail.get(email);
        } else if (name && deviceByName.has(name)) {
          matchedDevice = deviceByName.get(name);
        }

        if (matchedDevice && matchedDevice.id) {
          await this.updateAppContact(contactId, {
            device_contact_id: matchedDevice.id,
          });
          result.linked++;
          this.log(`Linked: ${appContact.name}`);
        }
      }

      this.log(`✓ Linking complete! ${result.linked} contacts linked`);
      return result;

    } catch (error: any) {
      result.errors.push(error?.message || 'Unknown error');
      console.error('Link contacts error:', error);
      return result;
    }
  }
}

export default ContactSyncService;
