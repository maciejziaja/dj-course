import { test, expect, type Page } from '@playwright/test'
import { NewTransportationRequestPage, serviceTypeLabels } from './new-transportation-request.page'

const validPickup = {
  street: 'ul. Testowa 1',
  city: 'Warsaw',
  country: 'Poland',
  contactPerson: 'Jan Testowy',
  contactPhone: '+48123456789',
  pickupDate: '2026-08-15',
}

const validDelivery = {
  street: 'Alexanderplatz 1',
  city: 'Berlin',
  country: 'Germany',
  contactPerson: 'Hans Mueller',
  contactPhone: '+49123456789',
}

async function fillPickup(page: Page, overrides: Partial<typeof validPickup> = {}) {
  const values = { ...validPickup, ...overrides }
  await page.getByRole('textbox', { name: 'Enter pickup address' }).fill(values.street)
  await page.getByRole('textbox', { name: 'Enter city' }).fill(values.city)
  if (values.country) {
    await page.getByRole('combobox').first().selectOption(values.country)
  }
  await page.getByRole('textbox', { name: 'Contact person name' }).fill(values.contactPerson)
  await page.getByRole('textbox', { name: 'Phone number' }).fill(values.contactPhone)
  if (values.pickupDate) {
    await page.locator('input[type="date"]').fill(values.pickupDate)
  }
}

async function fillDelivery(page: Page, overrides: Partial<typeof validDelivery> = {}) {
  const values = { ...validDelivery, ...overrides }
  await page.getByRole('textbox', { name: 'Enter delivery address' }).fill(values.street)
  await page.getByRole('textbox', { name: 'Enter city' }).fill(values.city)
  if (values.country) {
    await page.getByRole('combobox').first().selectOption(values.country)
  }
  await page.getByRole('textbox', { name: 'Contact person name' }).fill(values.contactPerson)
  await page.getByRole('textbox', { name: 'Phone number' }).fill(values.contactPhone)
}

test.describe('Service Type step', () => {
  test('Next is disabled until a service type is selected', async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await wizard.goto()

    await expect(wizard.nextButton).toBeDisabled()

    await wizard.selectServiceType(serviceTypeLabels.fullTruckload)

    await expect(wizard.nextButton).toBeEnabled()
  })
})

test.describe('Pickup Information step', () => {
  test.beforeEach(async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await wizard.goto()
    await wizard.selectServiceType(serviceTypeLabels.fullTruckload)
    await wizard.nextButton.click()
  })

  const requiredFields: Array<{ name: string; overrides: Partial<typeof validPickup> }> = [
    { name: 'street', overrides: { street: '' } },
    { name: 'city', overrides: { city: '' } },
    { name: 'country', overrides: { country: '' } },
    { name: 'contactPerson', overrides: { contactPerson: '' } },
    { name: 'contactPhone', overrides: { contactPhone: '' } },
    { name: 'pickupDate', overrides: { pickupDate: '' } },
  ]

  for (const { name, overrides } of requiredFields) {
    test(`Next stays disabled when ${name} is missing`, async ({ page }) => {
      const wizard = new NewTransportationRequestPage(page)
      await fillPickup(page, overrides)

      await expect(wizard.nextButton).toBeDisabled()
    })
  }

  test('Next is enabled once all required fields are filled', async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await fillPickup(page)

    await expect(wizard.nextButton).toBeEnabled()
  })
})

test.describe('Delivery Information step', () => {
  test.beforeEach(async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await wizard.goto()
    await wizard.selectServiceType(serviceTypeLabels.fullTruckload)
    await wizard.nextButton.click()
    await fillPickup(page)
    await wizard.nextButton.click()
  })

  const requiredFields: Array<{ name: string; overrides: Partial<typeof validDelivery> }> = [
    { name: 'street', overrides: { street: '' } },
    { name: 'city', overrides: { city: '' } },
    { name: 'country', overrides: { country: '' } },
    { name: 'contactPerson', overrides: { contactPerson: '' } },
    { name: 'contactPhone', overrides: { contactPhone: '' } },
  ]

  for (const { name, overrides } of requiredFields) {
    test(`Next stays disabled when ${name} is missing`, async ({ page }) => {
      const wizard = new NewTransportationRequestPage(page)
      await fillDelivery(page, overrides)

      await expect(wizard.nextButton).toBeDisabled()
    })
  }

  test('Next is enabled once all required fields are filled', async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await fillDelivery(page)

    await expect(wizard.nextButton).toBeEnabled()
  })
})

test.describe('Cargo Information step', () => {
  test.beforeEach(async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await wizard.goto()
    await wizard.selectServiceType(serviceTypeLabels.fullTruckload)
    await wizard.nextButton.click()
    await fillPickup(page)
    await wizard.nextButton.click()
    await fillDelivery(page)
    await wizard.nextButton.click()
  })

  test('Next stays disabled when cargo description is missing', async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await page.getByRole('spinbutton', { name: 'Enter weight in kg' }).fill('500')

    await expect(wizard.nextButton).toBeDisabled()
  })

  test('Next stays disabled when weight is zero', async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await page.getByRole('textbox', { name: 'Describe the cargo to be' }).fill('Palety z elektroniką')
    await page.getByRole('spinbutton', { name: 'Enter weight in kg' }).fill('0')

    await expect(wizard.nextButton).toBeDisabled()
  })

  test('Next is enabled once description and a positive weight are provided', async ({ page }) => {
    const wizard = new NewTransportationRequestPage(page)
    await wizard.fillCargo({ description: 'Palety z elektroniką', weight: 500 })

    await expect(wizard.nextButton).toBeEnabled()
  })
})
