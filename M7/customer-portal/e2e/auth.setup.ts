import { test as setup, expect } from '@playwright/test'

const authFile = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  setup.setTimeout(90_000)

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email address' }).fill('john.doe@example.com')
  await page.getByRole('textbox', { name: 'Password' }).fill('password123')

  // On a cold dev-server start, Nuxt is still hydrating (and /dashboard is
  // still compiling on demand) when the click lands, which silently
  // swallows it. Retry the click until the app actually navigates away
  // from /login instead of waiting on 'networkidle', which never settles
  // while Nuxt devtools/HMR keep a websocket open.
  await expect(async () => {
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 3_000 })
  }).toPass({ timeout: 60_000 })

  await page.context().storageState({ path: authFile })
})
