import { test, expect } from '@playwright/test'
import { NewTransportationRequestPage } from './new-transportation-request.page'

test('submits a new transportation request end to end', async ({ page }) => {
  const wizard = new NewTransportationRequestPage(page)
  await wizard.goto()

  await wizard.completeHappyPath()

  await expect(page.getByRole('heading', { name: 'Transportation Request Submitted Successfully!' })).toBeVisible()
  await expect(page.getByText('Reference Number')).toBeVisible()
  const referenceNumber = await page.getByText(/^TR-\d{4}-\d+$/).textContent()
  expect(referenceNumber).toMatch(/^TR-\d{4}-\d+$/)
})

test('newly submitted request appears in the transportation requests list', async ({ page }) => {
  const wizard = new NewTransportationRequestPage(page)
  await wizard.goto()
  await wizard.completeHappyPath()

  const referenceNumber = await page.getByText(/^TR-\d{4}-\d+$/).textContent()

  await page.getByRole('button', { name: 'View Request' }).click()

  await expect(page).toHaveURL('/dashboard/requests/transportation')
  const row = page.getByRole('row', { name: new RegExp(referenceNumber!) })
  await expect(row).toBeVisible()
  await expect(row.getByText('Warsaw → Berlin')).toBeVisible()
  await expect(row.getByText('Full Truckload')).toBeVisible()
  await expect(row.getByText('Submitted', { exact: true })).toBeVisible()
})
