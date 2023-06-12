// Define a new class called RechargeStaticBundle that extends the HTMLElement class
class RechargeStaticBundle extends HTMLElement {
    constructor() {
      // Call the constructor of the HTMLElement class
      super();

      // Initialize some instance variables
      this.bundleSettings = null;
      this.optionSource = '';
      this.productID = document.querySelector('.bundle').getAttribute('data-product-id');
      this.variantID = Number(document.querySelector('.product-variant-id').value);
      this.variants = [];

      // Call the initBundle() method to render the bundle
      this.initBundle();
    }

    // Define a method called initBundle() to render the bundle
    async initBundle() {
      // Retrieve the bundle settings from the ReCharge API
      this.bundleSettings = await recharge.cdn.getCDNBundleSettings(this.productID);
      // Retrieve the list of variants for the bundle
      this.variants = this.bundleSettings.variants;

      // Find the variant that matches the currently selected product variant
      const variant = this.getVariant();
      // If the variant has option sources, store the first one in the instance variable
      if (variant.option_sources.length > 0) {
        this.optionSource = variant.option_sources[0];
      }

      // Create an array of default selections for the variant
      const selections = variant.selection_defaults.map(item => ({
        collectionId: document.querySelector('.bundle').getAttribute('data-collection'),
        externalProductId: String(item.id),
        externalVariantId: item.external_variant_id,
        quantity: 1,
      }));

      // Define the selection object that will be used to retrieve bundle items
      const selection = {
        externalVariantId: this.variantID,
        externalProductId: this.productID,
        selections,
      };

      // Retrieve the bundle items using the ReCharge API
      const bundleItems = await recharge.bundle.getDynamicBundleItems(selection, {});
      // Retrieve the ID of the bundle
      const _rb_id = await recharge.bundle.getBundleId(selection, {});
      // Check if the bundle is valid
      const isValid = await recharge.bundle.validateBundle(selection);

      // If the bundle is valid, enable the submit button on the product form
      if (isValid) {
        document.querySelector('.product-bundle-id').value = _rb_id;
        document.querySelector('.product-form__submit').removeAttribute('disabled');
      }
    }

    // Define a method called getVariant() to find the variant that matches the currently selected product variant
    getVariant() {
      return this.variants.find(variant => Number(variant.external_variant_id) === this.variantID);
    }
  }

  // Define a new custom element called 'recharge-bundle-static' using the RechargeStaticBundle class
  customElements.define('recharge-bundle-static', RechargeStaticBundle);