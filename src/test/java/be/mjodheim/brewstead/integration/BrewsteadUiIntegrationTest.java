package be.mjodheim.brewstead.integration;

import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.Recipe;
import be.mjodheim.brewstead.entity.User;
import be.mjodheim.brewstead.enums.BehiveStatus;
import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.enums.BatchStatus;
import be.mjodheim.brewstead.enums.OrderStatus;
import be.mjodheim.brewstead.repository.*;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.logging.LogEntry;
import org.openqa.selenium.logging.LogType;
import org.openqa.selenium.logging.LoggingPreferences;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.time.Duration;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
    @Autowired IngredientRepository ingredientRepository;
    @Autowired PlayerOrderRepository orderRepository;
    @Autowired NpcOrderRepository npcOrderRepository;
    @Autowired NpcOrderLineRepository npcLineRepository;
    @Autowired TastingOfferRepository offerRepository;
    @Autowired PlayerAchievementRepository achievementRepository;
    @Autowired RecipeRepository recipeRepository;
    @Autowired PlayerInventoryRepository inventoryRepository;

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
            assertEquals("absolute", driver.findElement(By.id("weatherChip")).getCssValue("position"));
            assertTrue(driver.findElement(By.id("weatherChip")).getSize().width < 400);
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

            click(driver, wait, By.id("screenClose"));
            click(driver, wait, By.id("settingsBtn"));
            click(driver, wait, By.cssSelector("[data-action='open-settings']"));
            click(driver, wait, By.cssSelector("[data-action='set-mouvement'][data-id='sobre']"));
            String animation = driver.findElement(By.cssSelector(".water-shimmer"))
                    .getCssValue("animation-name");
            assertEquals("none", animation);

            click(driver, wait, By.cssSelector(".dock__tab[data-view='classement']"));

            driver.manage().window().setSize(new Dimension(390, 844));
            assertFalse(driver.findElement(By.id("quest")).isDisplayed());
            assertTrue(driver.findElement(By.id("dock")).isDisplayed());
            screenshot(driver, "03-progression-mobile.png");
            driver.manage().window().setSize(new Dimension(1440, 1000));

            click(driver, wait, By.cssSelector(".dock__tab[data-view='inventaire']"));
            waitForScreen(wait, "Entrepôt");
            assertFalse(driver.findElements(By.cssSelector("#screenBody .row")).isEmpty());

            click(driver, wait, By.id("screenClose"));
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
            click(driver, wait, By.cssSelector("[data-action='sow-field'] .sc-node__hit, [data-action='sow-field']"));
            waitForScreen(wait, "Choisir une culture");
            click(driver, wait, By.cssSelector("[data-action='pick-crop']"));
            wait.until(d -> fieldRepository.findAllByPlayerId(profile.getId()).stream()
                    .anyMatch(field -> field.getStatus() == FieldStatus.GROWING));

            click(driver, wait, By.cssSelector(".dock__tab[data-view='monde']"));
            click(driver, wait, By.cssSelector("#markers [data-place='rucher']"));
            wait.until(ExpectedConditions.textToBe(By.id("placeTitle"), "Rucher"));
            click(driver, wait, By.id("placeAction"));
            waitForScreen(wait, "Rucher");
            click(driver, wait, By.cssSelector("[data-action='start-hive'] .sc-node__hit, [data-action='start-hive']"));
            wait.until(d -> hiveRepository.findAllByPlayerId(profile.getId()).stream()
                    .anyMatch(hive -> hive.getStatus() == BehiveStatus.PRODUCING));

            var hive = hiveRepository.findAllByPlayerId(profile.getId()).stream()
                    .filter(value -> value.getStatus() == BehiveStatus.PRODUCING).findFirst().orElseThrow();
            hive.setReadyAt(LocalDateTime.now().minusSeconds(1));
            hiveRepository.save(hive);
            new WebDriverWait(driver, Duration.ofSeconds(30)).until(
                    ExpectedConditions.elementToBeClickable(By.cssSelector("#screenBody [data-action='harvest-hive'] .sc-node__hit, #screenBody [data-action='harvest-hive']")));
            click(driver, wait, By.cssSelector("#screenBody [data-action='harvest-hive'] .sc-node__hit, #screenBody [data-action='harvest-hive']"));
            wait.until(d -> hiveRepository.findById(hive.getId()).orElseThrow().getStatus() == BehiveStatus.IDLE);

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
        } catch (RuntimeException | AssertionError failure) {
            screenshot(driver, "failure-core-journey.png");
            throw failure;
        } finally {
            driver.quit();
        }
    }

    @Test
    void twoBrowsersCanChatFromTheMapWithoutLosingDraftsAndRecoverFromFailure() {
        WebDriver alice = newBrowser();
        WebDriver bob = newBrowser();
        WebDriverWait a = new WebDriverWait(alice, Duration.ofSeconds(20));
        WebDriverWait b = new WebDriverWait(bob, Duration.ofSeconds(20));
        try {
            registerAndLogin(alice, a, "ui_chat_alice");
            registerAndLogin(bob, b, "ui_chat_bob");
            click(alice, a, By.cssSelector("#markers [data-place='taverne']"));
            click(alice, a, By.id("placeAction"));
            waitForScreen(a, "Taverne");
            assertEquals(1, alice.findElements(By.id("chatInput")).size(), "Pas de champ caché homonyme");
            WebElement draft = a.until(ExpectedConditions.visibilityOfElementLocated(By.id("chatInput")));
            draft.sendKeys("Un message rédigé lentement");

            click(bob, b, By.cssSelector(".dock__tab[data-view='taverne']"));
            waitForScreen(b, "Taverne");
            b.until(ExpectedConditions.visibilityOfElementLocated(By.id("chatInput")))
                    .sendKeys("Bonjour Alice");
            click(bob, b, By.cssSelector("[data-action='chat-send']"));
            a.until(ExpectedConditions.textToBePresentInElementLocated(By.id("chatLog"), "Bonjour Alice"));
            new Actions(alice).pause(Duration.ofSeconds(5)).perform();
            assertEquals(draft, alice.findElement(By.id("chatInput")), "Le polling conserve le nœud du champ");
            assertEquals(draft, alice.switchTo().activeElement());
            assertEquals("Un message rédigé lentement", draft.getDomProperty("value"));
            draft.sendKeys(Keys.ENTER);
            b.until(ExpectedConditions.textToBePresentInElementLocated(By.id("chatLog"), "Un message rédigé lentement"));
            a.until(d -> d.findElement(By.id("chatInput")).getDomProperty("value").isEmpty());

            // Panne réseau à l'envoi : conserver le texte et rendre le bouton réutilisable.
            ((JavascriptExecutor) alice).executeScript("""
                    const original = window.fetch;
                    window.fetch = function(url, options) {
                        if (url === '/api/tavern/chat' && options?.method === 'POST') {
                            window.fetch = original;
                            return Promise.reject(new Error('Réseau indisponible'));
                        }
                        return original.apply(this, arguments);
                    };
                    """);
            alice.findElement(By.id("chatInput")).sendKeys("À renvoyer après la panne");
            click(alice, a, By.cssSelector("[data-action='chat-send']"));
            a.until(ExpectedConditions.textToBePresentInElementLocated(By.cssSelector(".chat__status"), "conservé"));
            assertEquals("À renvoyer après la panne", alice.findElement(By.id("chatInput")).getDomProperty("value"));
            screenshot(alice, "04-chat-retry-desktop.png");
            click(alice, a, By.cssSelector("[data-action='chat-send']"));
            b.until(ExpectedConditions.textToBePresentInElementLocated(By.id("chatLog"), "À renvoyer après la panne"));

            alice.manage().window().setSize(new Dimension(390, 844));
            WebElement input = alice.findElement(By.id("chatInput"));
            input.sendKeys("Message depuis le mobile");
            new Actions(alice).doubleClick(alice.findElement(By.cssSelector("[data-action='chat-send']"))).perform();
            b.until(ExpectedConditions.textToBePresentInElementLocated(By.id("chatLog"), "Message depuis le mobile"));
            assertEquals(1L, tavernMessageRepository.findAll().stream()
                    .filter(message -> "Message depuis le mobile".equals(message.getBody())).count());
            screenshot(alice, "05-chat-mobile.png");

            // Une vraie commande entre joueurs, publiée et livrée par l'interface.
            alice.manage().window().setSize(new Dimension(1440, 1000));
            click(alice, a, By.cssSelector(".dock__tab[data-view='commandes']"));
            click(alice, a, By.cssSelector("[data-action='new-order']"));
            a.until(ExpectedConditions.visibilityOfElementLocated(By.id("pickerSearch")))
                    .sendKeys("Eau de source");
            var water = ingredientRepository.findByNameIgnoreCase("Eau de source").orElseThrow();
            click(alice, a, By.cssSelector("[data-action='pick-order-ingredient'][data-id='" + water.getId() + "']"));
            WebElement quantity = alice.findElement(By.id("orderQty"));
            quantity.clear();
            quantity.sendKeys("2");
            WebElement reward = alice.findElement(By.id("orderReward"));
            reward.clear();
            reward.sendKeys("20");
            int coins = profile("ui_chat_alice").getCoin();
            ((JavascriptExecutor) alice).executeScript("""
                    const original = window.fetch;
                    window.fetch = function(url, options) {
                        if (url === '/api/player-orders' && options?.method === 'POST') {
                            window.fetch = original;
                            return original.apply(this, arguments).then(response =>
                                new Promise(resolve => setTimeout(() => resolve(response), 1200)));
                        }
                        return original.apply(this, arguments);
                    };
                    """);
            click(alice, a, By.cssSelector("[data-action='order-confirm']"));
            click(alice, a, By.cssSelector(".dock__tab[data-view='inventaire']"));
            a.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);
            waitForScreen(a, "Entrepôt");
            a.until(d -> !orderRepository.findAllByCreatorIdOrderByCreatedAtDesc(profile("ui_chat_alice").getId()).isEmpty());
            var order = orderRepository.findAllByCreatorIdOrderByCreatedAtDesc(profile("ui_chat_alice").getId()).getFirst();
            assertEquals(coins - 20, profile("ui_chat_alice").getCoin());
            click(bob, b, By.cssSelector(".dock__tab[data-view='commandes']"));
            By deliver = By.cssSelector("[data-action='fulfill-order'][data-id='" + order.getId() + "']");
            new WebDriverWait(bob, Duration.ofSeconds(30)).until(ExpectedConditions.elementToBeClickable(deliver));
            click(bob, b, deliver);
            b.until(d -> orderRepository.findById(order.getId()).orElseThrow().getStatus()
                    == be.mjodheim.brewstead.enums.OrderStatus.COMPLETED);
            screenshot(bob, "06-market-delivered.png");
            click(alice, a, By.cssSelector(".dock__tab[data-view='taverne']"));

            alice.findElement(By.id("chatInput")).sendKeys("Brouillon à conserver");
            click(alice, a, By.cssSelector(".dock__tab[data-view='monde']"));
            assertTrue(alice.findElements(By.id("chatInput")).isEmpty());
            click(alice, a, By.cssSelector(".dock__tab[data-view='taverne']"));
            assertEquals("Brouillon à conserver", alice.findElement(By.id("chatInput")).getDomProperty("value"));
            alice.manage().deleteCookieNamed("JSESSIONID");
            click(alice, a, By.cssSelector("[data-action='chat-send']"));
            a.until(ExpectedConditions.attributeToBe(By.id("fault"), "aria-hidden", "false"));
            assertEquals("Brouillon à conserver", alice.findElement(By.id("chatInput")).getDomProperty("value"));
            assertNoApplicationJavascriptErrors(bob);
        } catch (RuntimeException | AssertionError failure) {
            screenshot(alice, "failure-chat-alice.png");
            screenshot(bob, "failure-chat-bob.png");
            throw failure;
        } finally {
            alice.quit();
            bob.quit();
        }
    }

    @Test
    void completeProductionDeliveryAndTastingJourneyWithAnimatedScenery() {
        WebDriver brewer = newBrowser();
        WebDriver guest = newBrowser();
        WebDriverWait wait = new WebDriverWait(brewer, Duration.ofSeconds(35));
        WebDriverWait visitor = new WebDriverWait(guest, Duration.ofSeconds(25));
        try {
            registerAndLogin(brewer, wait, "ui_full_brewer");
            registerAndLogin(guest, visitor, "ui_full_guest");
            var player = profile("ui_full_brewer");

            // The decorative layers must really move, and leave the map clickable.
            var falls = brewer.findElement(By.cssSelector(".fall--near .fall__flow"));
            var cloud = brewer.findElement(By.cssSelector(".cloud-bank--near"));
            String flowBefore = falls.getCssValue("transform");
            String cloudBefore = cloud.getCssValue("transform");
            new Actions(brewer).pause(Duration.ofMillis(650)).perform();
            assertNotEquals(flowBefore, falls.getCssValue("transform"));
            assertNotEquals(cloudBefore, cloud.getCssValue("transform"));
            assertEquals("none", brewer.findElement(By.cssSelector(".world__life")).getCssValue("pointer-events"));
            ((JavascriptExecutor) brewer).executeScript("document.getElementById('game').dataset.light='jour'; document.getElementById('game').dataset.weather='clair';");
            screenshot(brewer, "07-living-domain-day.png");
            ((JavascriptExecutor) brewer).executeScript("document.getElementById('game').dataset.light='nuit';");
            screenshot(brewer, "08-living-domain-night.png");

            // Sow and harvest through the UI. Only waiting time is accelerated in
            // the isolated database: production, stock and rewards use real services.
            openSection(brewer, wait, "champs");
            click(brewer, wait, By.cssSelector("#screenBody [data-action='sow-field'] .sc-node__hit, #screenBody [data-action='sow-field']"));
            click(brewer, wait, By.cssSelector("#screenBody [data-action='pick-crop']"));
            waitForMutation(brewer, wait);
            var field = fieldRepository.findAllByPlayerId(player.getId()).stream()
                    .filter(value -> value.getStatus() == FieldStatus.GROWING).findFirst().orElseThrow();
            field.setReadyAt(LocalDateTime.now().minusSeconds(1));
            fieldRepository.save(field);
            openSection(brewer, wait, "champs");
            By harvest = By.cssSelector("#screenBody [data-action='harvest-field'][data-id='" + field.getId() + "']");
            click(brewer, wait, harvest);
            waitForMutation(brewer, wait);
            assertEquals(FieldStatus.EMPTY, fieldRepository.findById(field.getId()).orElseThrow().getStatus());
            assertEquals(1, progressRepository.findByPlayerId(player.getId()).orElseThrow().getHarvestedFields());

            openSection(brewer, wait, "rucher");
            click(brewer, wait, By.cssSelector("#screenBody [data-action='start-hive'] .sc-node__hit, #screenBody [data-action='start-hive']"));
            waitForMutation(brewer, wait);
            var hive = hiveRepository.findAllByPlayerId(player.getId()).stream()
                    .filter(value -> value.getStatus() == BehiveStatus.PRODUCING).findFirst().orElseThrow();
            hive.setReadyAt(LocalDateTime.now().minusSeconds(1));
            hiveRepository.save(hive);
            click(brewer, wait, By.cssSelector("#screenBody [data-action='harvest-hive'][data-id='" + hive.getId() + "']"));
            waitForMutation(brewer, wait);
            assertEquals(1, progressRepository.findByPlayerId(player.getId()).orElseThrow().getHarvestedHives());

            click(brewer, wait, By.cssSelector(".dock__tab[data-view='commandes']"));
            click(brewer, wait, By.cssSelector("[data-action='orders-tab'][data-id='pnj']"));
            click(brewer, wait, By.cssSelector("[data-action='npc-generate']"));
            waitForMutation(brewer, wait);
            var order = npcOrderRepository.findAllByPlayerIdOrderByCreatedAtDesc(player.getId()).getFirst();
            var line = npcLineRepository.findAllByOrderId(order.getId()).getFirst();
            click(brewer, wait, By.cssSelector("[data-action='npc-accept'][data-id='" + order.getId() + "']"));
            waitForMutation(brewer, wait);
            assertEquals(be.mjodheim.brewstead.enums.OrderStatus.IN_PROGRESS,
                    npcOrderRepository.findById(order.getId()).orElseThrow().getStatus());
            click(brewer, wait, By.cssSelector("[data-action='prepare-recipe']"));
            waitForScreen(wait, "Choisir une recette");
            click(brewer, wait, By.cssSelector("[data-action='pick-recipe']:not([disabled])"));
            waitForMutation(brewer, wait);
            var batch = batchRepository.findAllByPlayerIdOrderByStartedAtDesc(player.getId()).getFirst();
            Long batchId = batch.getId();
            BigDecimal brewed = batch.getVolume();
            batch.setReadyAt(LocalDateTime.now().minusSeconds(1));
            batchRepository.save(batch);
            openSection(brewer, wait, "brasserie");
            wait.until(ExpectedConditions.elementToBeClickable(By.cssSelector("[data-action='taste-batch'][data-id='" + batchId + "']")));

            int coinsBefore = profile("ui_full_brewer").getCoin();
            int reputationBefore = profile("ui_full_brewer").getReputation();
            click(brewer, wait, By.cssSelector(".dock__tab[data-view='commandes']"));
            click(brewer, wait, By.cssSelector("[data-action='npc-complete'][data-id='" + order.getId() + "']"));
            waitForMutation(brewer, wait);
            assertEquals(be.mjodheim.brewstead.enums.OrderStatus.COMPLETED,
                    npcOrderRepository.findById(order.getId()).orElseThrow().getStatus());
            assertTrue(profile("ui_full_brewer").getCoin() >= coinsBefore + order.getRewardCoins());
            assertTrue(profile("ui_full_brewer").getReputation() >= reputationBefore + order.getRewardReputation());
            assertEquals(0, brewed.subtract(BigDecimal.valueOf(line.getQuantity()))
                    .compareTo(batchRepository.findById(batchId).orElseThrow().getVolume()));
            assertTrue(brewer.findElements(By.cssSelector("[data-action='npc-complete']")).isEmpty());
            screenshot(brewer, "09-merchant-delivery.png");

            // The recipe book is searchable, uses the same duration as the brewery,
            // and tells a new player precisely what ingredients are missing.
            click(brewer, wait, By.cssSelector(".dock__tab[data-view='recettes']"));
            brewer.findElement(By.id("pickerSearch")).sendKeys("Hydromel doré");
            List<String> recipeNames = brewer.findElements(By.cssSelector("#screenBody .row__title"))
                    .stream().map(WebElement::getText).toList();
            assertTrue(recipeNames.contains("Hydromel doré"));
            assertTrue(recipeNames.stream().allMatch(name -> name.contains("Hydromel doré")));
            assertTrue(brewer.findElement(By.id("screenBody")).getText().contains("45 min"));
            brewer.findElement(By.id("pickerSearch")).clear();
            brewer.findElement(By.id("pickerSearch")).sendKeys("Cervoise du fjord");
            click(brewer, wait, By.cssSelector("[data-action='prepare-recipe']"));
            assertFalse(brewer.findElement(By.cssSelector("[data-action='pick-recipe']")).isEnabled());
            assertTrue(brewer.findElement(By.id("screenBody")).getText().contains("10 L"));

            openSection(brewer, wait, "brasserie");
            click(brewer, wait, By.cssSelector("[data-action='offer-batch'][data-id='" + batchId + "'] .sc-node__hit, " +
                    "[data-action='offer-batch'][data-id='" + batchId + "']"));
            assertFalse(brewer.findElement(By.id("screenBody")).getText().contains("undefined"));
            WebElement services = brewer.findElement(By.id("offerServings"));
            services.clear(); services.sendKeys("2");
            WebElement price = brewer.findElement(By.id("offerPrice"));
            price.clear(); price.sendKeys("7");
            click(brewer, wait, By.cssSelector("[data-action='offer-confirm']"));
            waitForMutation(brewer, wait);
            var offer = offerRepository.findFirstByBatchIdAndServingsGreaterThan(batchId, 0).orElseThrow();
            int guestCoins = profile("ui_full_guest").getCoin();
            int sellerCoins = profile("ui_full_brewer").getCoin();
            click(guest, visitor, By.cssSelector(".dock__tab[data-view='taverne']"));
            click(guest, visitor, By.cssSelector("[data-action='tavern-tab'][data-id='comptoir']"));
            click(guest, visitor, By.cssSelector("[data-action='serve-offer'][data-id='" + offer.getId() + "']"));
            waitForMutation(guest, visitor);
            assertEquals(guestCoins - 7, profile("ui_full_guest").getCoin());
            assertEquals(sellerCoins + 7, profile("ui_full_brewer").getCoin());
            assertEquals(1, offerRepository.findById(offer.getId()).orElseThrow().getServings());
            assertEquals(1, progressRepository.findByPlayerId(profile("ui_full_guest").getId()).orElseThrow().getTavernTastings());
            screenshot(guest, "10-neighbour-tasting-new-domain.png");

            brewer.manage().window().setSize(new Dimension(390, 844));
            click(brewer, wait, By.cssSelector(".dock__tab[data-view='classement']"));
            assertTrue(brewer.findElement(By.cssSelector(".daily-card")).isDisplayed());
            assertTrue((Boolean) ((JavascriptExecutor) brewer).executeScript(
                    "const e=document.getElementById('screenBody'); return e.scrollWidth <= e.clientWidth + 1;"));
            screenshot(brewer, "11-daily-mobile.png");
            click(brewer, wait, By.cssSelector(".dock__tab[data-view='monde']"));
            screenshot(brewer, "12-living-domain-mobile.png");

            // Both the system preference and the in-game switch stop decoration.
            ((ChromeDriver) brewer).executeCdpCommand("Emulation.setEmulatedMedia", Map.of(
                    "features", List.of(Map.of("name", "prefers-reduced-motion", "value", "reduce"))));
            assertEquals("none", falls.getCssValue("animation-name"));
            assertEquals("none", cloud.getCssValue("animation-name"));
            ((ChromeDriver) brewer).executeCdpCommand("Emulation.setEmulatedMedia", Map.of("features", List.of()));
            click(brewer, wait, By.id("settingsBtn"));
            click(brewer, wait, By.cssSelector("[data-action='open-settings']"));
            click(brewer, wait, By.cssSelector("[data-action='set-mouvement'][data-id='sobre']"));
            assertEquals("none", falls.getCssValue("animation-name"));
            assertEquals("none", cloud.getCssValue("animation-name"));
            click(brewer, wait, By.cssSelector("[data-action='toggle'][data-id='ambiance']"));
            assertFalse(brewer.findElement(By.cssSelector(".world__life")).isDisplayed());
            assertNoApplicationJavascriptErrors(brewer);
            assertNoApplicationJavascriptErrors(guest);
        } catch (RuntimeException | AssertionError failure) {
            screenshot(brewer, "failure-complete-journey.png");
            screenshot(guest, "failure-complete-guest.png");
            throw failure;
        } finally {
            brewer.quit(); guest.quit();
        }
    }

    private void waitForMutation(WebDriver driver, WebDriverWait wait) {
        wait.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);
        assertEquals("true", driver.findElement(By.id("fault")).getDomAttribute("aria-hidden"));
    }

    private void openSection(WebDriver driver, WebDriverWait wait, String place) {
        openPlaceScreen(driver, wait, place);
    }

    private WebDriver newBrowser() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1000");
        String binary = System.getenv("CHROME_BIN");
        if (binary != null && !binary.isBlank()) options.setBinary(binary);
        String executable = System.getenv("CHROMEDRIVER_PATH");
        if (executable != null && !executable.isBlank()) System.setProperty("webdriver.chrome.driver", executable);
        LoggingPreferences logging = new LoggingPreferences();
        logging.enable(LogType.BROWSER, Level.ALL);
        options.setCapability("goog:loggingPrefs", logging);
        return new ChromeDriver(options);
    }

    @Test
    void completeProductionDeliveryAndNeighbourTastingLoopWithAnimatedWorld() {
        WebDriver brewer = newBrowser();
        WebDriver guest = newBrowser();
        WebDriverWait wait = new WebDriverWait(brewer, Duration.ofSeconds(30));
        WebDriverWait guestWait = new WebDriverWait(guest, Duration.ofSeconds(30));
        try {
            registerAndLogin(brewer, wait, "ui_loop_brewer");
            registerAndLogin(guest, guestWait, "ui_loop_guest");
            var profile = profile("ui_loop_brewer");
            ((JavascriptExecutor) brewer).executeScript(
                    "document.getElementById('game').dataset.light='crepuscule'; document.getElementById('game').dataset.weather='clair';");
            WebElement flow = brewer.findElement(By.cssSelector(".fall--near .fall__flow"));
            assertEquals("none", brewer.findElement(By.cssSelector(".world__life")).getCssValue("pointer-events"));
            String firstFlow = flow.getCssValue("transform");
            String firstCloud = brewer.findElement(By.cssSelector(".cloud-bank--near")).getCssValue("transform");
            screenshot(brewer, "07-world-motion-a.png");
            new Actions(brewer).pause(Duration.ofMillis(900)).perform();
            assertNotEquals(firstFlow, flow.getCssValue("transform"));
            assertNotEquals(firstCloud, brewer.findElement(By.cssSelector(".cloud-bank--near")).getCssValue("transform"));
            screenshot(brewer, "08-world-motion-b.png");

            openPlaceScreen(brewer, wait, "champs");
            assertEquals("paused", flow.getCssValue("animation-play-state"), "L'animation repose pendant la lecture des menus");
            click(brewer, wait, By.cssSelector("#screenBody [data-action='sow-field'] .sc-node__hit, #screenBody [data-action='sow-field']"));
            click(brewer, wait, By.cssSelector("[data-action='pick-crop']"));
            wait.until(d -> fieldRepository.findAllByPlayerId(profile.getId()).stream().anyMatch(f -> f.getStatus() == FieldStatus.GROWING));
            var field = fieldRepository.findAllByPlayerId(profile.getId()).stream().filter(f -> f.getStatus() == FieldStatus.GROWING).findFirst().orElseThrow();
            // Accélération uniquement du temps d'attente ; récolte et récompenses passent par l'UI et les vraies API.
            field.setReadyAt(LocalDateTime.now().minusSeconds(1));
            fieldRepository.save(field);
            wait.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);
            openPlaceScreen(brewer, wait, "champs");
            click(brewer, wait, By.cssSelector("#screenBody [data-action='harvest-field'] .sc-node__hit, #screenBody [data-action='harvest-field']"));
            wait.until(d -> achievementRepository.existsByPlayerIdAndCode(profile.getId(), "FIRST_HARVEST"));
            wait.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);

            openPlaceScreen(brewer, wait, "brasserie");
            click(brewer, wait, By.cssSelector("[data-action='open-brew']"));
            brewer.findElement(By.id("pickerSearch")).sendKeys("Hydromel doré");
            click(brewer, wait, By.cssSelector("[data-action='pick-recipe']:not([disabled])"));
            wait.until(d -> !batchRepository.findAllByPlayerIdOrderByStartedAtDesc(profile.getId()).isEmpty());
            var batch = batchRepository.findAllByPlayerIdOrderByStartedAtDesc(profile.getId()).getFirst();
            batch.setReadyAt(LocalDateTime.now().minusSeconds(1));
            batchRepository.save(batch);
            wait.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);
            openPlaceScreen(brewer, wait, "brasserie");
            click(brewer, wait, By.cssSelector("#screenBody [data-action='taste-batch'] .sc-node__hit, #screenBody [data-action='taste-batch']"));
            wait.until(d -> batchRepository.findById(batch.getId()).orElseThrow().getVolume().compareTo(new BigDecimal("19.50")) == 0);
            wait.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);

            click(brewer, wait, By.cssSelector(".dock__tab[data-view='commandes']"));
            click(brewer, wait, By.cssSelector("[data-action='orders-tab'][data-id='pnj']"));
            click(brewer, wait, By.cssSelector("[data-action='npc-generate']"));
            wait.until(d -> !npcOrderRepository.findAllByPlayerIdOrderByCreatedAtDesc(profile.getId()).isEmpty());
            wait.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);
            var order = npcOrderRepository.findAllByPlayerIdOrderByCreatedAtDesc(profile.getId()).getFirst();
            click(brewer, wait, By.cssSelector("[data-action='npc-accept']"));
            wait.until(d -> npcOrderRepository.findById(order.getId()).orElseThrow().getStatus() == OrderStatus.IN_PROGRESS);
            wait.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);
            int coins = profile("ui_loop_brewer").getCoin();
            click(brewer, wait, By.cssSelector("[data-action='npc-complete']"));
            wait.until(d -> npcOrderRepository.findById(order.getId()).orElseThrow().getStatus() == OrderStatus.COMPLETED);
            wait.until(d -> d.findElement(By.id("game")).getDomAttribute("aria-busy") == null);
            assertTrue(profile("ui_loop_brewer").getCoin() >= coins + order.getRewardCoins());
            assertEquals(1, progressRepository.findByPlayerId(profile.getId()).orElseThrow().getSeasonRewardTier());
            screenshot(brewer, "09-merchant-delivered.png");

            openPlaceScreen(brewer, wait, "brasserie");
            click(brewer, wait, By.cssSelector("#screenBody [data-action='offer-batch'] .sc-node__hit, " +
                    "#screenBody [data-action='offer-batch']"));
            WebElement servings = brewer.findElement(By.id("offerServings"));
            assertTrue(Integer.parseInt(servings.getDomAttribute("max")) <= batchRepository.findById(batch.getId()).orElseThrow().getVolume().multiply(BigDecimal.valueOf(2)).intValue());
            servings.clear();
            servings.sendKeys("2");
            WebElement price = brewer.findElement(By.id("offerPrice"));
            price.clear();
            price.sendKeys("5");
            brewer.findElement(By.id("offerNote")).sendKeys("La cuvée du parcours complet");
            click(brewer, wait, By.cssSelector("[data-action='offer-confirm']"));
            wait.until(d -> offerRepository.findFirstByBatchIdAndServingsGreaterThan(batch.getId(), 0).isPresent());
            var offer = offerRepository.findFirstByBatchIdAndServingsGreaterThan(batch.getId(), 0).orElseThrow();
            click(guest, guestWait, By.cssSelector(".dock__tab[data-view='taverne']"));
            click(guest, guestWait, By.cssSelector("[data-action='tavern-tab'][data-id='comptoir']"));
            click(guest, guestWait, By.cssSelector("[data-action='serve-offer'][data-id='" + offer.getId() + "']"));
            guestWait.until(d -> offerRepository.findById(offer.getId()).orElseThrow().getServings() == 1);
            assertEquals(1, progressRepository.findByPlayerId(profile("ui_loop_guest").getId()).orElseThrow().getTavernTastings());
            screenshot(guest, "10-neighbour-tasting.png");

            click(brewer, wait, By.cssSelector(".dock__tab[data-view='classement']"));
            assertTrue(brewer.findElements(By.cssSelector(".achievement.is-unlocked")).size() >= 2);
            brewer.navigate().refresh();
            wait.until(ExpectedConditions.textToBe(By.id("playerName"), "ui_loop_brewer"));
            click(brewer, wait, By.cssSelector(".dock__tab[data-view='classement']"));
            assertTrue(brewer.findElements(By.cssSelector(".achievement.is-unlocked")).size() >= 2);
            screenshot(brewer, "11-persistent-rewards.png");
            assertNoApplicationJavascriptErrors(brewer);
            assertNoApplicationJavascriptErrors(guest);
        } catch (RuntimeException | AssertionError failure) {
            screenshot(brewer, "failure-full-loop.png");
            throw failure;
        } finally {
            brewer.quit();
            guest.quit();
        }
    }

    /**
     * Le laboratoire : on assemble un mélange, on l'inscrit au grimoire, et la
     * recette obtenue est aussitôt brassable. Au passage, le portrait du HUD
     * doit ouvrir le compte — c'est le premier geste que tente un joueur.
     */
    @Test
    void laboratoryTurnsAMixIntoAPrivateRecipeAndThePortraitOpensTheAccount() {
        WebDriver driver = newBrowser();
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(20));
        String username = "ui_lab_" + System.nanoTime() % 100000;

        try {
            registerAndLogin(driver, wait, username);
            PlayerProfile profile = profile(username);

            // Le portrait est un bouton, pas un simple panneau décoratif.
            click(driver, wait, By.id("playerCard"));
            waitForScreen(wait, "Mon compte");
            assertFalse(driver.findElements(By.cssSelector(".avatar-pick")).isEmpty());
            click(driver, wait, By.id("screenClose"));

            openPlaceScreen(driver, wait, "laboratoire");
            waitForScreen(wait, "Grimoire des recettes");
            long before = recipeRepository.countByOwnerId(profile.getId());

            click(driver, wait, By.cssSelector("[data-action='open-lab']"));
            waitForScreen(wait, "Composer une recette");

            String name = "Cuvée " + username;
            WebElement labName = wait.until(
                    ExpectedConditions.visibilityOfElementLocated(By.id("labName")));
            labName.sendKeys(name);

            // Changer de type puis ajouter un ingrédient ne doit rien effacer.
            click(driver, wait, By.cssSelector("[data-action='lab-type'][data-id='BEER']"));
            assertEquals(name, driver.findElement(By.id("labName")).getAttribute("value"));

            addIngredient(driver, wait, "miel");
            addIngredient(driver, wait, "eau");
            assertEquals(name, driver.findElement(By.id("labName")).getAttribute("value"),
                    "Le nom saisi doit survivre aux ajouts d'ingrédients.");
            assertEquals(2, driver.findElements(By.cssSelector("[data-action='lab-remove']")).size());

            // La dose se règle sans champ de saisie : rien à perdre au réaffichage.
            click(driver, wait, By.cssSelector("[data-action='lab-more']"));

            WebElement minutes = driver.findElement(By.id("labMinutes"));
            minutes.clear();
            minutes.sendKeys("15");
            screenshot(driver, "07-laboratory-mix.png");

            click(driver, wait, By.cssSelector("[data-action='lab-save']"));
            waitForScreen(wait, "Grimoire des recettes");
            wait.until(d -> recipeRepository.countByOwnerId(profile.getId()) == before + 1);

            Recipe created = recipeRepository.findAllByIsPublicTrueOrOwnerId(profile.getId()).stream()
                    .filter(recipe -> name.equals(recipe.getName()))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("La recette n'a pas rejoint le grimoire."));
            assertFalse(created.isPublic(), "Une invention reste privée.");
            assertEquals(15, created.getFermentationMinutes());
            assertNotNull(created.getRarity());
            assertNotNull(created.getFlavour(), "Le mélange doit produire une ligne de dégustation.");

            wait.until(d -> d.findElement(By.id("screenBody")).getText().contains(name));

            // Et elle est immédiatement proposée au moment de lancer un brassin.
            openPlaceScreen(driver, wait, "brasserie");
            waitForScreen(wait, "Brasserie");
            click(driver, wait, By.cssSelector("[data-action='open-brew']"));
            waitForScreen(wait, "Choisir une recette");
            WebElement search = wait.until(
                    ExpectedConditions.visibilityOfElementLocated(By.id("pickerSearch")));
            search.sendKeys(name);
            wait.until(d -> d.findElement(By.id("screenBody")).getText().contains(name));

            assertNoApplicationJavascriptErrors(driver);
            screenshot(driver, "08-laboratory-brewable.png");
        } catch (RuntimeException | AssertionError failure) {
            screenshot(driver, "failure-laboratory.png");
            throw failure;
        } finally {
            driver.quit();
        }
    }

    /**
     * La tournée de récolte : le bouton n'apparaît que lorsqu'il y a de quoi
     * ramasser, il annonce combien, et un seul clic vide champs et ruches.
     */
    @Test
    void theReapButtonAppearsOnlyWhenSomethingIsRipeAndEmptiesTheDomainAtOnce() {
        WebDriver driver = newBrowser();
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(20));
        String username = "ui_reap_" + System.nanoTime() % 100000;

        try {
            registerAndLogin(driver, wait, username);
            PlayerProfile profile = profile(username);

            // Domaine au repos : rien à ramasser, donc pas de bouton.
            assertFalse(driver.findElement(By.id("reapBtn")).isDisplayed(),
                    "Un domaine au repos n'affiche pas la tournée.");

            openPlaceScreen(driver, wait, "champs");
            waitForScreen(wait, "Champs");
            click(driver, wait, By.cssSelector("[data-action='sow-field'] .sc-node__hit, [data-action='sow-field']"));
            waitForScreen(wait, "Choisir une culture");
            click(driver, wait, By.cssSelector("[data-action='pick-crop']"));
            wait.until(d -> fieldRepository.findAllByPlayerId(profile.getId()).stream()
                    .anyMatch(field -> field.getStatus() == FieldStatus.GROWING));

            openPlaceScreen(driver, wait, "rucher");
            waitForScreen(wait, "Rucher");
            click(driver, wait, By.cssSelector("[data-action='start-hive'] .sc-node__hit, [data-action='start-hive']"));
            wait.until(d -> hiveRepository.findAllByPlayerId(profile.getId()).stream()
                    .anyMatch(hive -> hive.getStatus() == BehiveStatus.PRODUCING));
            click(driver, wait, By.id("screenClose"));

            // On avance le temps plutôt que de l'attendre.
            LocalDateTime past = LocalDateTime.now().minusMinutes(1);
            fieldRepository.findAllByPlayerId(profile.getId()).stream()
                    .filter(field -> field.getStatus() == FieldStatus.GROWING)
                    .forEach(field -> { field.setReadyAt(past); fieldRepository.save(field); });
            hiveRepository.findAllByPlayerId(profile.getId()).stream()
                    .filter(hive -> hive.getStatus() == BehiveStatus.PRODUCING)
                    .forEach(hive -> { hive.setReadyAt(past); hiveRepository.save(hive); });

            driver.navigate().refresh();
            wait.until(ExpectedConditions.textToBe(By.id("playerName"), username));
            wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("reapBtn")));
            assertEquals("2", driver.findElement(By.id("reapCount")).getText(),
                    "Une parcelle et une ruche font deux.");

            // Les écriteaux disent aussi ce qui attend, sans ouvrir le lieu.
            WebElement fields = driver.findElement(By.cssSelector("#markers [data-place='champs']"));
            assertEquals("ready", fields.getAttribute("data-state"));
            assertEquals("1", fields.findElement(By.cssSelector(".marker__count")).getText());
            screenshot(driver, "09-reap-call.png");

            click(driver, wait, By.id("reapBtn"));
            wait.until(d -> fieldRepository.findAllByPlayerId(profile.getId()).stream()
                    .noneMatch(field -> field.getStatus() == FieldStatus.READY)
                    && hiveRepository.findAllByPlayerId(profile.getId()).stream()
                    .noneMatch(hive -> hive.getStatus() == BehiveStatus.READY));
            wait.until(ExpectedConditions.invisibilityOfElementLocated(By.id("reapBtn")));

            // Le miel et la céréale sont bien rentrés.
            assertFalse(inventoryRepository.findAllByPlayerId(profile.getId()).isEmpty());

            // Un compteur de ressource est un raccourci, pas un cul-de-sac.
            click(driver, wait, By.cssSelector("#resources .resource"));
            wait.until(ExpectedConditions.attributeToBe(By.id("screen"), "aria-hidden", "false"));
            click(driver, wait, By.id("screenClose"));

            // Sur un téléphone la carte ne montre qu'un lieu sur sept : la
            // barre prend le relais, et elle doit tenir sous le bandeau.
            driver.manage().window().setSize(new Dimension(390, 844));
            WebElement bar = wait.until(
                    ExpectedConditions.visibilityOfElementLocated(By.id("places")));
            assertEquals(7, driver.findElements(By.cssSelector(".place-chip")).size());
            int headerBottom = driver.findElement(By.cssSelector(".hud--top")).getRect().getY()
                    + driver.findElement(By.cssSelector(".hud--top")).getSize().getHeight();
            assertTrue(bar.getRect().getY() >= headerBottom,
                    "La barre des lieux ne doit pas chevaucher le bandeau.");

            click(driver, wait, By.cssSelector(".place-chip[data-place='champs']"));
            wait.until(ExpectedConditions.textToBe(By.id("placeTitle"), "Champs"));
            screenshot(driver, "10-places-mobile.png");
            driver.manage().window().setSize(new Dimension(1440, 1000));

            assertNoApplicationJavascriptErrors(driver);
        } catch (RuntimeException | AssertionError failure) {
            screenshot(driver, "failure-reap.png");
            throw failure;
        } finally {
            driver.quit();
        }
    }

    private void addIngredient(WebDriver driver, WebDriverWait wait, String query) {
        WebElement search = wait.until(
                ExpectedConditions.visibilityOfElementLocated(By.id("pickerSearch")));
        search.clear();
        search.sendKeys(query);
        click(driver, wait, By.cssSelector("[data-action='lab-add']"));
    }

    private void openPlaceScreen(WebDriver driver, WebDriverWait wait, String place) {
        click(driver, wait, By.cssSelector(".dock__tab[data-view='monde']"));
        // Les coordonnées du clic natif doivent être prises après le recentrage.
        wait.until(d -> (Boolean) ((JavascriptExecutor) d).executeScript(
                "return document.querySelector('.world__scene').getAnimations().every(a => a.playState !== 'running');"));
        click(driver, wait, By.cssSelector("#markers [data-place='" + place + "']"));
        wait.until(ExpectedConditions.attributeToBe(By.id("place"), "aria-hidden", "false"));
        click(driver, wait, By.id("placeAction"));
        wait.until(ExpectedConditions.attributeToBe(By.id("screen"), "aria-hidden", "false"));
    }

    private void registerAndLogin(WebDriver driver, WebDriverWait wait, String username) {
        driver.get("http://127.0.0.1:" + port + "/register");
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.name("username"))).sendKeys(username);
        driver.findElement(By.name("password")).sendKeys("Secret123!");
        driver.findElement(By.name("confirmation")).sendKeys("Secret123!");
        click(driver, wait, By.cssSelector("form button[type='submit']"));
        wait.until(ExpectedConditions.urlContains("/login?registered"));
        driver.findElement(By.name("username")).sendKeys(username);
        driver.findElement(By.name("password")).sendKeys("Secret123!");
        click(driver, wait, By.cssSelector("form button[type='submit']"));
        wait.until(ExpectedConditions.textToBe(By.id("playerName"), username));
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
        wait.ignoring(StaleElementReferenceException.class).ignoring(ElementClickInterceptedException.class)
                .until(d -> {
                    WebElement element = d.findElement(locator);
                    if (!element.isDisplayed() || !element.isEnabled()) return false;
                    click(d, element);
                    return true;
                });
    }

    private void click(WebDriver driver, WebElement element) {
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView({block:'center', inline:'nearest'});", element);
        element.click();
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
            // Photographier l'écran installé, sans figer les animations du décor.
            new WebDriverWait(driver, Duration.ofSeconds(5)).until(d -> (Boolean) ((JavascriptExecutor) d)
                    .executeScript("return document.getAnimations().every(a => !(a instanceof CSSTransition) || a.playState !== 'running');"));
            Path directory = Path.of("target", "playtest");
            Files.createDirectories(directory);
            Files.write(directory.resolve(name), ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES));
        } catch (Exception failure) {
            fail("Capture du playtest impossible : " + failure.getMessage());
        }
    }
}
