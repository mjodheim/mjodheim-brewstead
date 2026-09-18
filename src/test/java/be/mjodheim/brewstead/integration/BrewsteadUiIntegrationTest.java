package be.mjodheim.brewstead.integration;

import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.User;
import be.mjodheim.brewstead.enums.BehiveStatus;
import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.repository.*;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.logging.LogEntry;
import org.openqa.selenium.logging.LogType;
import org.openqa.selenium.logging.LoggingPreferences;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.logging.Level;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BrewsteadUiIntegrationTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired PlayerProfileRepository playerRepository;
    @Autowired PlayerFieldRepository fieldRepository;
    @Autowired BeehiveRepository hiveRepository;
    @Autowired BatchRepository batchRepository;
    @Autowired TavernMessageRepository tavernMessageRepository;

    @Test
    void browserCanRegisterLoginRenderAndDriveCoreUiActions() {
        String username = "ui_eirik";
        String password = "Secret123!";

        ChromeOptions options = new ChromeOptions();
        options.addArguments(
                "--headless=new",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--window-size=1440,1000"
        );
        LoggingPreferences logging = new LoggingPreferences();
        logging.enable(LogType.BROWSER, Level.ALL);
        options.setCapability("goog:loggingPrefs", logging);

        WebDriver driver = new ChromeDriver(options);
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));
        String base = "http://127.0.0.1:" + port;

        try {
            driver.get(base + "/register");
            wait.until(ExpectedConditions.visibilityOfElementLocated(By.name("username"))).sendKeys(username);
            driver.findElement(By.name("password")).sendKeys(password);
            driver.findElement(By.name("confirmation")).sendKeys(password);
            driver.findElement(By.cssSelector("form button[type='submit']")).click();

            wait.until(ExpectedConditions.urlContains("/login?registered"));
            assertTrue(driver.getPageSource().contains("Ton domaine est prêt"));

            driver.findElement(By.name("username")).sendKeys(username);
            driver.findElement(By.name("password")).sendKeys(password);
            driver.findElement(By.cssSelector("form button[type='submit']")).click();

            wait.until(ExpectedConditions.urlToBe(base + "/"));
            wait.until(d -> !d.findElement(By.id("playerName")).getText().equals("—"));

            assertEquals(username, driver.findElement(By.id("playerName")).getText());
            assertEquals("true", driver.findElement(By.id("fault")).getAttribute("aria-hidden"));
            assertEquals(5, driver.findElements(By.cssSelector("#resources .resource")).size());
            assertEquals(7, driver.findElements(By.cssSelector("#markers .marker")).size());

            PlayerProfile profile = profile(username);

            click(driver, wait, By.cssSelector(".dock__tab[data-view='inventaire']"));
            waitForScreen(wait, "Entrepôt");
            assertFalse(driver.findElements(By.cssSelector("#screenBody .row")).isEmpty());

            click(driver, wait, By.id("settingsBtn"));
            waitForScreen(wait, "Mon compte");
            WebElement accountName = wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("accountName")));
            accountName.clear();
            accountName.sendKeys("Eirik UI");
            click(driver, wait, By.cssSelector("[data-action='save-account']"));
            wait.until(ExpectedConditions.textToBe(By.id("playerName"), "Eirik UI"));
            assertEquals("Eirik UI", playerRepository.findById(profile.getId()).orElseThrow().getDisplayName());

            click(driver, wait, By.cssSelector(".dock__tab[data-view='monde']"));
            click(driver, wait, By.cssSelector("#markers [data-place='champs']"));
            wait.until(ExpectedConditions.textToBe(By.id("placeTitle"), "Champs"));
            click(driver, wait, By.id("placeAction"));
            waitForScreen(wait, "Champs");
            click(driver, wait, By.cssSelector("[data-action='sow-field']"));
            waitForScreen(wait, "Choisir une culture");
            click(driver, wait, By.cssSelector("[data-action='pick-crop']"));
            wait.until(d -> fieldRepository.findAllByPlayerId(profile.getId()).stream()
                    .anyMatch(field -> field.getStatus() == FieldStatus.GROWING));

            click(driver, wait, By.cssSelector(".dock__tab[data-view='monde']"));
            click(driver, wait, By.cssSelector("#markers [data-place='rucher']"));
            wait.until(ExpectedConditions.textToBe(By.id("placeTitle"), "Rucher"));
            click(driver, wait, By.id("placeAction"));
            waitForScreen(wait, "Rucher");
            click(driver, wait, By.cssSelector("[data-action='start-hive']"));
            wait.until(d -> hiveRepository.findAllByPlayerId(profile.getId()).stream()
                    .anyMatch(hive -> hive.getStatus() == BehiveStatus.PRODUCING));

            click(driver, wait, By.cssSelector(".dock__tab[data-view='monde']"));
            click(driver, wait, By.cssSelector("#markers [data-place='brasserie']"));
            wait.until(ExpectedConditions.textToBe(By.id("placeTitle"), "Brasserie"));
            click(driver, wait, By.id("placeAction"));
            waitForScreen(wait, "Brasserie");
            click(driver, wait, By.cssSelector("[data-action='open-brew']"));
            waitForScreen(wait, "Choisir une recette");
            WebElement brewable = wait.until(d -> d.findElements(
                            By.cssSelector("[data-action='pick-recipe']:not([disabled])"))
                    .stream().findFirst().orElse(null));
            assertNotNull(brewable, "Le stock initial doit permettre au moins un brassin.");
            click(driver, brewable);
            wait.until(d -> !batchRepository.findAllByPlayerIdOrderByStartedAtDesc(profile.getId()).isEmpty());

            click(driver, wait, By.cssSelector(".dock__tab[data-view='recettes']"));
            waitForScreen(wait, "Grimoire des recettes");
            assertFalse(driver.findElements(By.cssSelector("#screenBody .row")).isEmpty());

            click(driver, wait, By.cssSelector(".dock__tab[data-view='taverne']"));
            waitForScreen(wait, "Taverne");
            WebElement chat = wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("chatInput")));
            chat.sendKeys("Skål depuis Chromium");
            chat.sendKeys(Keys.ENTER);
            wait.until(d -> tavernMessageRepository.findAll().stream()
                    .anyMatch(message -> "Skål depuis Chromium".equals(message.getBody())));
            wait.until(d -> d.getPageSource().contains("Skål depuis Chromium"));

            assertEquals("true", driver.findElement(By.id("fault")).getAttribute("aria-hidden"));
            assertNoApplicationJavascriptErrors(driver);
        } finally {
            driver.quit();
        }
    }

    private PlayerProfile profile(String username) {
        User user = userRepository.findByUsername(username).orElseThrow();
        return playerRepository.findByUserId(user.getId()).orElseThrow();
    }

    private void waitForScreen(WebDriverWait wait, String title) {
        wait.until(ExpectedConditions.attributeToBe(By.id("screen"), "aria-hidden", "false"));
        wait.until(ExpectedConditions.textToBe(By.id("screenTitle"), title));
    }

    private void click(WebDriver driver, WebDriverWait wait, By locator) {
        WebElement element = wait.until(ExpectedConditions.presenceOfElementLocated(locator));
        click(driver, element);
    }

    private void click(WebDriver driver, WebElement element) {
        ((JavascriptExecutor) driver).executeScript("arguments[0].click();", element);
    }

    private void assertNoApplicationJavascriptErrors(WebDriver driver) {
        List<String> errors = driver.manage().logs().get(LogType.BROWSER).getAll().stream()
                .filter(entry -> entry.getLevel().intValue() >= Level.SEVERE.intValue())
                .map(LogEntry::getMessage)
                .filter(message -> {
                    String lower = message.toLowerCase(Locale.ROOT);
                    return lower.contains("uncaught")
                            || lower.contains("typeerror")
                            || lower.contains("referenceerror")
                            || lower.contains("syntaxerror")
                            || (lower.contains("127.0.0.1") && lower.contains("500"));
                })
                .toList();

        assertTrue(errors.isEmpty(), "Erreurs JavaScript détectées : " + errors);
    }
}
