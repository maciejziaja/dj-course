import { expect, type Page } from '@playwright/test'

export const serviceTypeLabels = {
  fullTruckload: 'Full Truckload (FTL)',
  lessThanTruckload: 'Less Than Truckload (LTL)',
  express: 'Express Delivery',
  oversized: 'Oversized Cargo',
  hazardous: 'Hazardous Materials',
} as const

export interface LocationInput {
  street: string
  city: string
  country: string
  contactPerson: string
  contactPhone: string
}

export class NewTransportationRequestPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/transportation/new')
  }

  get nextButton() {
    return this.page.getByRole('button', { name: 'Next' })
  }

  get backButton() {
    return this.page.getByRole('button', { name: 'Back' })
  }

  get submitButton() {
    return this.page.getByRole('button', { name: 'Submit Request' })
  }

  async selectServiceType(label: string) {
    // On a cold dev-server start the page can still be hydrating when the
    // click lands, silently swallowing it (the radio never checks). Retry
    // until the store actually picks up the selection.
    await expect(async () => {
      await this.page.getByText(label, { exact: true }).click()
      await expect(this.nextButton).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 60_000 })
  }

  async fillPickup(pickup: LocationInput & { pickupDate: string }) {
    await this.page.getByRole('textbox', { name: 'Enter pickup address' }).fill(pickup.street)
    await this.page.getByRole('textbox', { name: 'Enter city' }).fill(pickup.city)
    await this.page.getByRole('combobox').first().selectOption(pickup.country)
    await this.page.getByRole('textbox', { name: 'Contact person name' }).fill(pickup.contactPerson)
    await this.page.getByRole('textbox', { name: 'Phone number' }).fill(pickup.contactPhone)
    await this.page.locator('input[type="date"]').fill(pickup.pickupDate)
  }

  async fillDelivery(delivery: LocationInput) {
    await this.page.getByRole('textbox', { name: 'Enter delivery address' }).fill(delivery.street)
    await this.page.getByRole('textbox', { name: 'Enter city' }).fill(delivery.city)
    await this.page.getByRole('combobox').first().selectOption(delivery.country)
    await this.page.getByRole('textbox', { name: 'Contact person name' }).fill(delivery.contactPerson)
    await this.page.getByRole('textbox', { name: 'Phone number' }).fill(delivery.contactPhone)
  }

  async fillCargo(cargo: { description: string; weight: number }) {
    await this.page.getByRole('textbox', { name: 'Describe the cargo to be' }).fill(cargo.description)
    await this.page.getByRole('spinbutton', { name: 'Enter weight in kg' }).fill(String(cargo.weight))
  }

  async completeHappyPath() {
    await this.selectServiceType(serviceTypeLabels.fullTruckload)
    await this.nextButton.click()

    await this.fillPickup({
      street: 'ul. Testowa 1',
      city: 'Warsaw',
      country: 'Poland',
      contactPerson: 'Jan Testowy',
      contactPhone: '+48123456789',
      pickupDate: '2026-08-15',
    })
    await this.nextButton.click()

    await this.fillDelivery({
      street: 'Alexanderplatz 1',
      city: 'Berlin',
      country: 'Germany',
      contactPerson: 'Hans Mueller',
      contactPhone: '+49123456789',
    })
    await this.nextButton.click()

    await this.fillCargo({
      description: 'Palety z elektroniką',
      weight: 500,
    })
    await this.nextButton.click()

    // Special Instructions step has no required fields.
    await this.nextButton.click()

    await this.submitButton.click()
  }
}
