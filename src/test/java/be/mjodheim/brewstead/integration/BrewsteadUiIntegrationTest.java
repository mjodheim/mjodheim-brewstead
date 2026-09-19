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
import java.nio.file.Files;
import java.nio.file.Path;
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
    @Autowired PlayerProgressRepository progressRepository;

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
        String chromeBinary = System.getenv("CHROME_BIN");
        if (chromeBinary != null && !chromeBinary.isBlank()) {
            options.setBinary(chromeBinary);
        }
        String chromeDriver = System.getenv("CHROMEDRIVER_PATH");
        if (chromeDriver != null && !chromeDriver.isBlank()) {
            System.setProperty("webdriver.chrome.driver", chromeDriver);
        }

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
            screenshot(driver, "01-domain-desktop.png");

            PlayerProfile profile = profile(username);
            profile.setLevel(2);
            playerRepository.save(profile);
            driver.navigate().refresh();
            wait.until(ExpectedConditions.textToBe(By.id("playerLevel"), "Niveau 2"));

            click(driver, wait, By.cssSelector(".dock__tab[data-view='classement']"));
            waitForScreen(wait, "Renommée & hauts faits");
            assertEquals(3, driver.findElements(By.cssSelector(".specialization")).size());
            assertEquals(4, driver.findElements(By.cssSelector(".theme-choice")).size());
            assertTrue(driver.findElement(By.cssSelector(".season-card")).isDisplayed());
            click(driver, wait, By.cssSelector("[data-action='choose-specialization'][data-id='CULTIVATEUR']"));
            wait.until(ExpectedConditions.attributeContains(
                    By.cssSelector("[data-action='choose-specialization'][data-id='CULTIVATEUR']"), "class", "is-selected"));
            click(driver, wait, By.cssSelector("[data-action='choose-theme'][data-id='HIVER']"));
            wait.until(ExpectedConditions.attributeToBe(By.id("game"), "data-theme", "hiver"));
            assertEquals("CULTIVATEUR", progressRepository.findByPlayerId(profile.getId()).orElseThrow()
                    .getSpecialization().name());
            screenshot(driver, "02-progression-desktop.png");

            ((JavascriptExecutor) driver).executeScript(
                    "document.documentElement.dataset.mouvement='sobre'");
            String animation = driver.findElement(By.cssSelector(".water-shimmer"))
                    .getCssValue("animation-name");
            assertEquals("none", animation);

            driver.manage().window().setSize(new Dimension(390, 844));
            assertFalse(driver.findElement(By.id("quest")).isDisplayed());
            assertTrue(driver.findElement(By.id("dock")).isDisplayed());
            screenshot(driver, "03-progression-mobile.png");
            driver.manage().window().setSize(new Dimension(1440, 1000));

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

    private void screenshot(WebDriver driver, String name) {
        try {
            Path directory = Path.of("target", "playtest");
            Files.createDirectories(directory);
            Files.write(directory.resolve(name), ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES));
        } catch (Exception failure) {
            fail("Capture du playtest impossible : " + failure.getMessage());
        }
    }
}
